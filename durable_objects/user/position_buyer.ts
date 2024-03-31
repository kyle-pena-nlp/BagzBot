
import { Connection, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Wallet } from "../../crypto";
import { Env } from "../../env";
import { logError, logInfo } from "../../logging";
import { MenuRetryBuy, MenuViewOpenPosition } from "../../menus";
import { Position, PositionRequest, PositionStatus, Quote, getSwapOfXDescription } from "../../positions";
import { SwapSummary, isSuccessfulSwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
import { upsertPosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapTransactionSigner } from "./swap_transaction_signer";
import { TransactionExecutor } from "./user_swap";

export class PositionBuyer {
    wallet : Wallet
    env : Env
    startTimeMS : number
    constructor(wallet : Wallet, 
        env : Env,  
        startTimeMS : number) {
        this.wallet = wallet;
        this.env = env;
        this.startTimeMS = startTimeMS;
    }
    private checkElapsedTime() {
        // See if the whole thing took less than 25s.
        return (Date.now() - this.startTimeMS) < 25000;
    }
    private assertElapsedTime() {
        const weGood = this.checkElapsedTime();
        if (!weGood) {
            throw { outOfTime : true };
        }
    }
    async buy(positionRequest : PositionRequest) {

        // non-blocking notification channel to push update messages to TG
        const notificationChannel = TGStatusMessage.replaceWithNotification(
            positionRequest.messageID, 
            `Initiating.`, 
            false, 
            positionRequest.chatID, 
            this.env);

        // RPC connection
        const connection = new Connection(this.env.RPC_ENDPOINT_URL);

        // get signed tx
        const signedTx = await this.createSignedTx(positionRequest, notificationChannel);

        // if failed to get signedTx, early out but allow retry (maybe jup API down?)
        if (signedTx == null) {
            TGStatusMessage.queue(notificationChannel, `Unable to sign transaction for ${getSwapOfXDescription(positionRequest)}`, true);
            return 'can-retry';
        }

        // try to buy.
        const result = await this.buyInternal(positionRequest, signedTx, connection, notificationChannel);

        await TGStatusMessage.finalize(notificationChannel);
        
        if (result === 'can-retry') {
            // give user option to retry
            const retryBuyMenuRequest = new MenuRetryBuy(positionRequest).getUpdateExistingMenuRequest(positionRequest.chatID, positionRequest.messageID, this.env);
            await fetch(retryBuyMenuRequest);
        }
        else {
            // take straight to position view
            const newPosition = result.newPosition;
            const viewOpenPositionMenuRequest = new MenuViewOpenPosition({ brandNewPosition : true, position: newPosition }).getUpdateExistingMenuRequest(positionRequest.chatID, positionRequest.messageID, this.env);
            await fetch(viewOpenPositionMenuRequest); 
        }
    }

    private async createSignedTx(positionRequest : PositionRequest, notificationChannel : UpdateableNotification) {
        const swapTxSigner = new SwapTransactionSigner(this.wallet, this.env, notificationChannel);
        const signedTx = await swapTxSigner.createAndSign(positionRequest);
        return signedTx;
    }

    private async buyInternal(positionRequest: PositionRequest, signedTx : VersionedTransaction, connection : Connection, notificationChannel : UpdateableNotification) : Promise<'can-retry'|{ newPosition: Position }> {
        
        // programatically generate bs58 signature of tx
        const signature = bs58.encode(signedTx.signatures[0]);
        
        // attempt to execute tx.  all sorts of things can go wrong.
        const txExecute = new TransactionExecutor(this.wallet, this.env, notificationChannel, connection, this.startTimeMS);
        const parsedSwapSummary = await txExecute.executeAndConfirmSignedTx(positionRequest, signedTx);

        let newPosition : Position|undefined = undefined;

        // if the tx was executed but the swap failed
        if (parsedSwapSummary === 'swap-failed') {
            logInfo("Swap failed", positionRequest);
        }
        // if the act of sending the tx itself failed
        else if (parsedSwapSummary === 'tx-failed') {
            logInfo("Tx failed", positionRequest);
        }
        // if we couldn't retrieve (and therefore coulnd't confirm) the tx
        else if (parsedSwapSummary === 'could-not-confirm') {
            logError("Could not retrieve tx - converting to unconfirmed position", positionRequest);
            const quote = positionRequest.quote;
            newPosition = convertToUnconfirmedPosition(positionRequest, quote, signature);
            await upsertPosition(newPosition, this.env);
            TGStatusMessage.queue(notificationChannel, 'Transaction could not be confirmed - we will attempt to confirm later.', false);
        }
        else if (parsedSwapSummary === 'swap-failed-slippage') {
            logInfo("slippage on buy", positionRequest);
            TGStatusMessage.queue(notificationChannel, 'The buy failed due to slippage tolerance being exceeded.  Your order was not placed.', false);
        }
        else if (isSuccessfulSwapSummary(parsedSwapSummary)) {
            newPosition = convertConfirmedRequestToPosition(positionRequest, parsedSwapSummary.swapSummary);
            await upsertPosition(newPosition, this.env);
            TGStatusMessage.queue(notificationChannel, `Peak Price is now being tracked. Position will be unwound when price dips below ${positionRequest.triggerPercent}% of peak.`, false);
        }
        else {
            assertNever(parsedSwapSummary);
        }

        if (newPosition == null) {
            return 'can-retry';
        }
        else if (newPosition != null) {
            return  { newPosition };
        }
        else {
            assertNever(newPosition);
        }
    }
}

function convertToUnconfirmedPosition(positionRequest : PositionRequest, quote : Quote, txSignature : string) {
    const position : Position = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        type: positionRequest.positionType,
        status: PositionStatus.Open,
        confirmed: false, // <----------
        isConfirmingBuy: false,
        sellConfirmed: null,
        isConfirmingSell: false,
        txSignature: txSignature,
        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        vsTokenAmt : quote.inTokenAmt,
        tokenAmt: quote.outTokenAmt,
        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        sellAutoDoubleSlippage : positionRequest.sellAutoDoubleSlippage,
        fillPrice: quote.fillPrice // this may not be the final quote on buy, but it is likely close
    };
    return position;
}

function convertConfirmedRequestToPosition(positionRequest: PositionRequest, swapSummary : SwapSummary) : Position {
    const position : Position = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        type: positionRequest.positionType,
        status: PositionStatus.Open,
        confirmed: true, // <-------------
        isConfirmingBuy: false,
        sellConfirmed: null,
        isConfirmingSell: false,
        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        sellAutoDoubleSlippage : positionRequest.sellAutoDoubleSlippage,
        txSignature: swapSummary.txSignature,      
        vsTokenAmt : swapSummary.inTokenAmt,
        tokenAmt: swapSummary.outTokenAmt,        
        fillPrice: swapSummary.fillPrice
    };
    return position;
}