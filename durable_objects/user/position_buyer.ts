
import { Connection, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { UserAddress, Wallet, toUserAddress } from "../../crypto";
import { fromNumber } from "../../decimalized";
import { Env, getRPCUrl } from "../../env";
import { Position, PositionRequest, PositionStatus } from "../../positions";
import { getLatestValidBlockhash } from "../../rpc/rpc_blocks";
import { ParsedSuccessfulSwapSummary, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isSwapExecutionErrorParseSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
import { markBuyAsConfirmed, positionExistsInTracker, removePosition, upsertPosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapExecutor } from "./swap_executor";
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

    async buy(positionRequest : PositionRequest) : Promise<void> {
        try {
            await this.buyInternal(positionRequest);
        }
        finally {
            await TGStatusMessage.finalize(this.channel);
        }
    }

    async buyInternal(positionRequest : PositionRequest) : Promise<'already-processed'|'could-not-create-tx'|'failed'|'slippage-failed'|'unconfirmed'|'confirmed'> {

        // RPC connection
        const connection = new Connection(getRPCUrl(this.env));

        // idempotency
        if (await positionExistsInTracker(positionRequest.positionID, positionRequest.token.address, positionRequest.vsToken.address, this.env)) {
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
        const unconfirmedPosition = this.convertRequestToUnconfirmedPosition(positionRequest, signatureOf(signedTx), lastValidBH);
        await upsertPosition(unconfirmedPosition, this.env);

        // try to do the swap.
        const result = await this.executeAndParseSwap(positionRequest, signedTx, lastValidBH, connection);

        // no guarantees that anything after this point executes... CF may drop it.

        if (result === 'failed' || result === 'slippage-failed') {
            await removePosition(positionRequest.positionID, positionRequest.token.address, positionRequest.vsToken.address, this.env);
            return result;
        }
        else if (result === 'unconfirmed') {
            return result;
        }
        else if ('confirmedPosition' in result) {
            const { confirmedPosition } = result;
            // TODO: second pass.
            // await upsertConfirmedPosition(confirmedPosition, env);
            await markBuyAsConfirmed(confirmedPosition.positionID, confirmedPosition.token.address, confirmedPosition.vsToken.address, this.env);
            return 'confirmed';
        }
        else {
            assertNever(result);
        }
    }

    private convertRequestToUnconfirmedPosition(positionRequest : PositionRequest, signature : string, lastValidBH : number) : Position & { buyConfirmed: false } {
        const position : Position & { buyConfirmed : false } = {
            userID: positionRequest.userID,
            chatID : positionRequest.chatID,
            messageID : positionRequest.messageID,
            positionID : positionRequest.positionID,
            type: positionRequest.positionType,
            status: PositionStatus.Open,
            userAddress: toUserAddress(this.wallet),
    
            buyConfirmed: false, // <----------
            txBuySignature: signature,
            buyLastValidBlockheight: lastValidBH,
            
            sellConfirmed: false,
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

    private async executeAndParseSwap(positionRequest: PositionRequest, signedTx : VersionedTransaction, lastValidBH : number, connection : Connection) : Promise<'slippage-failed'|'failed'|'unconfirmed'|{ confirmedPosition: Position & { buyConfirmed : true } }> {
        
        // create a time-limited tx executor and confirmer
        const swapExecutor = new SwapExecutor(this.wallet, 'buy', this.env, this.channel, connection, lastValidBH, this.startTimeMS);

        // attempt to execute, confirm, and parse w/in time limit
        const parsedSwapSummary = await swapExecutor.executeTxAndParseResult(positionRequest, signedTx);

        // convert the tx execution result to a position, if possible
 
        if (parsedSwapSummary === 'tx-failed') {
            return 'failed';
        }
        else if (parsedSwapSummary === 'unconfirmed') {
            return 'unconfirmed';
        }
        else if (isUnknownTransactionParseSummary(parsedSwapSummary)) {
            return 'unconfirmed';
        }
        else if (isSlippageSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'slippage-failed';
        }
        else if (isSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'failed';
        }        
        else if (isSuccessfulSwapSummary(parsedSwapSummary)) {
            const confirmedPosition = await this.makeConfirmedPositionFromSwapResult(positionRequest, signatureOf(signedTx), lastValidBH, parsedSwapSummary);
            return { confirmedPosition };
        }
        else {
            assertNever(parsedSwapSummary);
        }
    }

    private async makeConfirmedPositionFromSwapResult(
        positionRequest : PositionRequest, 
        signature : string,
        lastValidBH: number,
        successfulSwapParsed : ParsedSuccessfulSwapSummary) : Promise<Position & { buyConfirmed : true }> {
        
        const newPosition = convertToConfirmedPosition(positionRequest, signature, lastValidBH, toUserAddress(this.wallet), successfulSwapParsed);

        // has or has not been set depending on above logic.
        return newPosition;
    }    
}

function convertToConfirmedPosition(positionRequest: PositionRequest, signature : string, lastValidBH : number, userAddress : UserAddress, parsedSuccessfulSwap : ParsedSuccessfulSwapSummary) : Position & { buyConfirmed : true } {
    const position : Position & { buyConfirmed : true } = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        userAddress: userAddress,
        type: positionRequest.positionType,
        status: PositionStatus.Open,

        buyConfirmed: true, // <-------------
        txBuySignature: signature,  
        buyLastValidBlockheight: lastValidBH,        

        sellConfirmed: false,
        txSellSignature: null,
        sellLastValidBlockheight: null,

        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        sellAutoDoubleSlippage : positionRequest.sellAutoDoubleSlippage,
    
        vsTokenAmt : fromNumber(positionRequest.vsTokenAmt),
        tokenAmt: parsedSuccessfulSwap.swapSummary.outTokenAmt,        
        fillPrice: parsedSuccessfulSwap.swapSummary.fillPrice,
        fillPriceMS : parsedSuccessfulSwap.swapSummary.swapTimeMS
    };
    return position;
}

function signatureOf(signedTx : VersionedTransaction) : string {
    return bs58.encode(signedTx.signatures[0]);
}