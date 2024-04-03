
import { Connection, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Wallet } from "../../crypto";
import { fromNumber } from "../../decimalized";
import { Env, getRPCUrl } from "../../env";
import { logError, logInfo } from "../../logging";
import { MenuRetryBuy, MenuRetryBuySlippageError, MenuViewOpenPosition } from "../../menus";
import { Position, PositionRequest, PositionStatus, Quote } from "../../positions";
import { getLatestValidBlockhash } from "../../rpc/rpc_blocks";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
import { removePosition, upsertPosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { CouldNotConfirmTxResultAndInfo, SuccessfulTxResultAndInfo, SwapExecutor, TransactionExecutionResult, isCouldNotConfirmTxResultAndInfo, isSuccessfulTxExecutionResult, isSwapFailedSlippageTxResultAndInfo, isSwapFailedTxResultAndInfo } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";

export class PositionBuyer {
    wallet : Wallet
    env : Env
    startTimeMS : number
    channel : UpdateableNotification
    constructor(wallet : Wallet, 
        env : Env,  
        startTimeMS : number,
        channel : UpdateableNotification) {
        this.wallet = wallet;
        this.env = env;
        this.startTimeMS = startTimeMS;
        this.channel = channel;
    }
    async buy(positionRequest : PositionRequest) : Promise<'already-processed'|'could-not-create-tx'|'failed'|'slippage-failed'|'unconfirmed'|'confirmed'> {
        try {
            return await this.buyInternal(positionRequest);
        }
        finally {
            await TGStatusMessage.finalize(this.channel);
        }
    }

    async buyInternal(positionRequest : PositionRequest) : Promise<'already-processed'|'could-not-create-tx'|'failed'|'slippage-failed'|'unconfirmed'|'confirmed'> {

        // RPC connection
        const connection = new Connection(getRPCUrl(this.env));

        // idempotency
        if (await existsInTracker(positionRequest.positionID)) {
            return 'already-processed';
        }

        // get signed tx (signed does not mean executed, per se)
        const signedTx = await this.createSignedTx(positionRequest, this.channel);

        // if failed to get signedTx, early out.
        if (signedTx == null) {
            TGStatusMessage.queue(this.channel, `Unable to sign transaction.`, true);
            return 'could-not-create-tx';
        }

        // get latest valid BH (tells us how long to keep trying to send tx)
        let lastValidBH = await getLatestValidBlockhash(connection, 3);

        // if failed, can't proceed.
        if (lastValidBH == null) {
            TGStatusMessage.queue(this.channel, `Unable to complete transaction due to high trade volume.`, true);
            return 'could-not-create-tx';
        }

        // upsert as an unconfirmed position. 
        // tracker will periodically attempts to reconfirm unconfirmed positions
        const unconfirmedPosition = this.convertRequestToPosition(positionRequest, signatureOf(signedTx), lastValidBH);
        await upsertPosition(unconfirmedPosition, this.env);

        // try to do the swap.
        const result = await this.performSwap(positionRequest, signedTx, connection);

        // no guarantees that anything after this point executes... CF may drop it.

        if (result === 'failed' || result === 'slippage-failed') {
            await removePosition(positionRequest.positionID, positionRequest.token.address, positionRequest.vsToken.address, this.env);
            return result;
        }
        else if (result === 'unconfirmed') {
            return result;
        }
        else if ('newPosition' in result) {
            const { newPosition } = result;
            await markBuyAsConfirmed(newPosition.positionID);
        }
        else {
            assertNever(result);
        }
    }

    private convertRequestToPosition(positionRequest : PositionRequest, signature : string, lastValidBH : number) {
        const position : Position = {
            userID: positionRequest.userID,
            chatID : positionRequest.chatID,
            messageID : positionRequest.messageID,
            positionID : positionRequest.positionID,
            type: positionRequest.positionType,
            status: PositionStatus.Open,
    
            buyConfirmed: false, // <----------
            isConfirmingBuy: false,
            txBuySignature: signature,
            buyLastValidBlockheight: lastValidBH,
            
            sellConfirmed: null,
            isConfirmingSell: false,
            txSellSignature: null,
            sellLastValidBlockheight: null,
    
            token: positionRequest.token,
            vsToken: positionRequest.vsToken,
            vsTokenAmt : fromNumber(positionRequest.vsTokenAmt), // don't use the quote, it includes fees.
            tokenAmt: positionRequest.quote.outTokenAmt,
    
            sellSlippagePercent: positionRequest.slippagePercent,
            triggerPercent : positionRequest.triggerPercent,
            sellAutoDoubleSlippage : positionRequest.sellAutoDoubleSlippage,
            fillPrice: positionRequest.quote.fillPrice,
            fillPriceMS : positionRequest.quote.quoteTimeMS
        };
        return position;
    }

    private async createSignedTx(positionRequest : PositionRequest, notificationChannel : UpdateableNotification) {
        const swapTxSigner = new SwapTransactionSigner(this.wallet, this.env, notificationChannel);
        const signedTx = await swapTxSigner.createAndSign(positionRequest);
        return signedTx;
    }

    private async performSwap(positionRequest: PositionRequest, signedTx : VersionedTransaction, connection : Connection) : Promise<'slippage-failed'|'failed'|'unconfirmed'|{ newPosition: Position }> {
        
        // create a time-limited tx executor and confirmer
        const swapExecutor = new SwapExecutor(this.wallet, this.env, this.channel, connection, this.startTimeMS);

        // attempt to execute and confirm w/in time limit
        const txExecutionResult = await swapExecutor.executeAndConfirmSignedTx(positionRequest, signedTx);

        // convert the tx execution result to a position, if possible
        let newPosition : Position|undefined = await this.maybeCreatePosition(positionRequest, txExecutionResult, this.channel);

        // newPosition is null indicates no pos created (confirmed OR unconfirmed)
        // and therefore, user can retry.
        if (isSwapFailedSlippageTxResultAndInfo(txExecutionResult)) {
            return 'slippage-failed';
        }
        // TODO: insufficient funds error
        else if (newPosition == null) {
            return 'failed';
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
        fillPrice: quote.fillPrice,
        fillPriceMS : quote.quoteTimeMS
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
        fillPrice: txExecutionResult.result.swapSummary.fillPrice,
        fillPriceMS : txExecutionResult.result.swapSummary.swapTimeMS
    };
    return position;
}

function signatureOf(signedTx : VersionedTransaction) : string {
    return bs58.encode(signedTx.signatures[0]);
}