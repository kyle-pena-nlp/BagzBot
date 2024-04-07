import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { DecimalizedAmount, dSub } from "../../decimalized";
import { Env } from "../../env";
import { MenuCode } from "../../menus";
import { Position, PositionStatus } from "../../positions";
import { getLatestValidBlockhash } from "../../rpc/rpc_blocks";
import { signatureOf } from "../../rpc/rpc_sign_tx";
import { ParsedSuccessfulSwapSummary, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary, isSwapExecutionErrorParseSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever, strictParseInt } from "../../util";
import { markAsClosed, markAsOpen, positionExistsInTracker, updatePosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapExecutor } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";

export class PositionSeller {
    connection : Connection
    wallet : Wallet
    type : 'manual-sell'|'auto-sell'
    startTimeMS : number
    channel : UpdateableNotification
    env : Env
    constructor(connection : Connection, wallet : Wallet, type : 'manual-sell'|'auto-sell', startTimeMS : number, channel : UpdateableNotification, env : Env) {
        this.connection = connection;
        this.wallet = wallet;
        this.type = type
        this.startTimeMS = startTimeMS;
        this.channel = channel;
        this.env = env;
    }
    isTimedOut() : boolean {
        return Date.now() > (this.startTimeMS + strictParseInt(this.env.TX_TIMEOUT_MS));
    }
    async sell(position : Position) : Promise<void> {
        try {
            const status = await this.sellInternal(position);
            const statusMessage = this.makeFinalStatusMessage(position, status);
            const menuCode = this.makeFinalMenuCode(status);
            TGStatusMessage.queue(this.channel, statusMessage, menuCode, position.positionID);
        }
        catch {
            const menuCode = this.type === 'manual-sell' ? MenuCode.ViewOpenPosition : MenuCode.Close;
            TGStatusMessage.queue(this.channel, "There was an unexpected error.", menuCode, position.positionID);
        }
    }

    private async sellInternal(position : Position) : Promise<'already-sold'|'failed'|'slippage-failed'|'unconfirmed'|'confirmed'> {
        
        if (this.isTimedOut()) {
            await this.markAsOpen(position);
            return 'failed';
        }

        // TODO: how do I avoid double-sells if the request to this DO is re-fired

        if (!(await this.positionExistsInTracker(position))) {
            return 'already-sold';
        }

        // get signed tx (signed does not mean executed, per se)
        const signedTx = await this.createSignedTx(position);

        if (signedTx == null) {
            await this.markAsOpen(position);
            return 'failed';
        }

        // get latest valid BH (tells us how long to keep trying to send tx)
        let lastValidBH = await getLatestValidBlockhash(this.connection, 3);

        // if failed, can't proceed.
        if (lastValidBH == null) {
            await this.markAsOpen(position);
            return 'failed';
        }

        // update the tracker with the sig & lastvalidBH for the sell.
        position.txSellSignature = signatureOf(signedTx);
        position.sellLastValidBlockheight = lastValidBH;
        position.status = PositionStatus.Closing;
        position.txSellAttemptTimeMS = Date.now();
        await updatePosition(position, this.env);

        // try to do the swap.
        const result = await this.executeAndParseSwap(position, signedTx, lastValidBH);

        // no guarantees that anything after this point executes... CF may drop it.

        if (result === 'failed') {
            await this.markAsOpen(position);
            return 'failed';
        }
        else if (result === 'slippage-failed') {
            await this.markAsOpen(position);
            return 'slippage-failed';
        }
        else if (result === 'unconfirmed') {
            return 'unconfirmed';
        }
        else if (isSuccessfullyParsedSwapSummary(result)) {
            const netPNL = dSub(result.swapSummary.outTokenAmt, position.vsTokenAmt);
            await this.markAsClosed(position, netPNL);
            return 'confirmed';
        }
        else {
            assertNever(result);
        }        
    }
  
    private async createSignedTx(position : Position) : Promise<VersionedTransaction|undefined> {
        const swapTxSigner = new SwapTransactionSigner(this.wallet, this.env, this.channel);
        const signedTx = await swapTxSigner.createAndSign(position);
        return signedTx;
    }

    private async executeAndParseSwap(position : Position, signedTx : VersionedTransaction, lastValidBH : number) : Promise<'failed'|'slippage-failed'|'unconfirmed'|ParsedSuccessfulSwapSummary> {
        
        // create a time-limited tx executor and confirmer
        const swapExecutor = new SwapExecutor(this.wallet, 'sell', this.env, this.channel, this.connection, lastValidBH, this.startTimeMS);

        // attempt to execute, confirm, and parse w/in time limit
        const parsedSwapSummary = await swapExecutor.executeTxAndParseResult(position, signedTx);

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
            return parsedSwapSummary;
        }
        else {
            assertNever(parsedSwapSummary);
        }
    }

    private async positionExistsInTracker(position : Position) : Promise<boolean> {
        return (await positionExistsInTracker(position.positionID, position.token.address, position.vsToken.address, this.env))
    }

    private async markAsOpen(position : Position) {
        await markAsOpen(position.positionID, position.token.address, position.vsToken.address, this.env);
    }

    private async markAsClosed(position : Position, netPNL : DecimalizedAmount) {
        await markAsClosed(position.positionID, position.token.address, position.vsToken.address, netPNL, this.env);
    }


    private makeFinalStatusMessage(position : Position, status : 'already-sold' | 'failed' | 'slippage-failed' | 'unconfirmed' | 'confirmed') : string {
        switch(status) {
            case 'already-sold':
                return 'The position was already sold.';
            case 'confirmed':
                return 'The sale was successful!';
            case 'failed':
                return 'The sale failed.';
            case 'slippage-failed':
                if (position.sellAutoDoubleSlippage) {
                    return 'The sale failed due to slippage - the sale will be reattempted with doubled slippage up until 100%.';
                }
                else {
                    return 'The sale failed due to slippage.'
                }
            case 'unconfirmed':
                return 'The sale could not be confirmed due to network congestion. We will reattempt confirmation within a few minutes.';
            default:
                assertNever(status);
        }
    }

    private makeFinalMenuCode(status : 'already-sold' | 'failed' | 'slippage-failed' | 'unconfirmed' | 'confirmed') : MenuCode {
        if (this.type === 'auto-sell') {
            return MenuCode.Close;
        }
        switch(status) {
            case 'already-sold':
                return MenuCode.ListPositions;
            case 'confirmed':
                return MenuCode.ViewPNLHistory;
            case 'failed':
                return MenuCode.ViewOpenPosition;
            case 'slippage-failed':
                return MenuCode.ViewOpenPosition;
            case 'unconfirmed':
                return MenuCode.ViewOpenPosition;
            default:
                assertNever(status);
        }
    }    
}