
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { fromNumber } from "../../decimalized";
import { Env } from "../../env";
import { logError, logInfo } from "../../logging";
import { MenuRetryBuy, MenuViewOpenPosition } from "../../menus";
import { Position, PositionRequest, PositionStatus, Quote, getSwapOfXDescription } from "../../positions";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
import { upsertPosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { CouldNotConfirmTxResultAndInfo, SuccessfulTxResultAndInfo, SwapExecutor, TransactionExecutionResult, isCouldNotConfirmTxResultAndInfo, isSuccessfulTxExecutionResult, isSwapFailedSlippageTxResultAndInfo, isSwapFailedTxResultAndInfo } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";

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

        // send out any queued messages in the channel
        await TGStatusMessage.finalize(notificationChannel);
        
        // display the next option to the user, depending on whether they can retry to the buy, or it succeeded
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
        
        // create a time-limited tx executor and confirmer
        const txExecute = new SwapExecutor(this.wallet, this.env, notificationChannel, connection, this.startTimeMS);

        // attempt to execute and confirm w/in time limit
        const txExecutionResult = await txExecute.executeAndConfirmSignedTx(positionRequest, signedTx);

        // convert the tx execution result to a position, if possible
        let newPosition : Position|undefined = await this.maybeCreatePosition(positionRequest, txExecutionResult, notificationChannel);

        // newPosition is null indicates no pos created (confirmed OR unconfirmed)
        // and therefore, user can retry.
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

    private async maybeCreatePosition(
        positionRequest : PositionRequest, 
        txExecutionResult : TransactionExecutionResult, 
        notificationChannel: UpdateableNotification) : Promise<Position | undefined> {
    
        let newPosition : Position|undefined = undefined;
        
        // if the tx failed to send at all
        if (txExecutionResult === 'tx-failed') {
            logInfo("Tx failed", positionRequest);
        }
        // if the tx was executed, but the swap failed due to slippage
        else if (isSwapFailedSlippageTxResultAndInfo(txExecutionResult)) {
            logInfo("slippage on buy", positionRequest);
            TGStatusMessage.queue(notificationChannel, 'The buy failed due to slippage tolerance being exceeded.  Your order was not placed.', false);
        }        
        // if the tx was executed but the swap failed (for some reason other than slippage)
        else if (isSwapFailedTxResultAndInfo(txExecutionResult)) {
            logInfo("Swap failed", positionRequest);
        }
        // if we couldn't determine the state of the tx (this is where things get hairy and the hendersons)
        else if (isCouldNotConfirmTxResultAndInfo(txExecutionResult)) {
            logError("Could not retrieve tx - converting to unconfirmed position", positionRequest);
            // ship the possibly-real position to the tracker in a state of 'unconfirmed'
            // the tracker will periodically attempt to reconfirm (and will remove if it in fact failed after all)
            const quote = positionRequest.quote;
            newPosition = convertToUnconfirmedPosition(positionRequest, quote, txExecutionResult);
            await upsertPosition(newPosition, this.env);
            TGStatusMessage.queue(notificationChannel, 'Transaction could not be confirmed - we will attempt to confirm later.', false);
        }
        // the swap succeeded! this is happy world.
        else if (isSuccessfulTxExecutionResult(txExecutionResult)) {
            newPosition = convertConfirmedRequestToPosition(positionRequest, txExecutionResult);
            await upsertPosition(newPosition, this.env);
            TGStatusMessage.queue(notificationChannel, `Peak Price is now being tracked. Position will be unwound when price dips below ${positionRequest.triggerPercent}% of peak.`, false);
        }
        else {
            assertNever(txExecutionResult);
        }

        // has or has not been set depending on above logic.
        return newPosition;
    }    
}

function convertToUnconfirmedPosition(positionRequest : PositionRequest, quote : Quote, txExecutionResult : CouldNotConfirmTxResultAndInfo) {
    const position : Position = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        type: positionRequest.positionType,
        status: PositionStatus.Open,

        buyConfirmed: false, // <----------
        isConfirmingBuy: false,
        txBuySignature: txExecutionResult.signature,
        buyLastValidBlockheight: txExecutionResult.lastValidBH,
        
        sellConfirmed: null,
        isConfirmingSell: false,
        txSellSignature: null,
        sellLastValidBlockheight: null,

        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        vsTokenAmt : fromNumber(positionRequest.vsTokenAmt), // don't use the quote, it includes fees.
        tokenAmt: quote.outTokenAmt,

        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        sellAutoDoubleSlippage : positionRequest.sellAutoDoubleSlippage,
        fillPrice: quote.fillPrice // don't use the quote calculation.  it includes fees in the inTokenAmt.
    };
    return position;
}

function convertConfirmedRequestToPosition(positionRequest: PositionRequest, txExecutionResult : SuccessfulTxResultAndInfo) : Position {
    const position : Position = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        type: positionRequest.positionType,
        status: PositionStatus.Open,

        buyConfirmed: true, // <-------------
        isConfirmingBuy: false,
        txBuySignature: txExecutionResult.signature,  
        buyLastValidBlockheight: txExecutionResult.lastValidBH,        

        sellConfirmed: null,
        isConfirmingSell: false,
        txSellSignature: null,
        sellLastValidBlockheight: null,

        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        sellAutoDoubleSlippage : positionRequest.sellAutoDoubleSlippage,
    
        vsTokenAmt : fromNumber(positionRequest.vsTokenAmt),
        tokenAmt: txExecutionResult.result.swapSummary.outTokenAmt,        
        fillPrice: txExecutionResult.result.swapSummary.fillPrice
    };
    return position;
}