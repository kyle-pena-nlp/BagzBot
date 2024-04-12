import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { DecimalizedAmount, dSub } from "../../decimalized";
import { Env } from "../../env";
import { MenuCode } from "../../menus";
import { Position, PositionStatus } from "../../positions";
import { getLatestValidBlockhash } from "../../rpc/rpc_blocks";
import { signatureOf } from "../../rpc/rpc_sign_tx";
import { ParsedSuccessfulSwapSummary, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever, strictParseInt } from "../../util";
import { deactivatePositionInTracker, incrementOtherSellFailureCountInTracker, markAsClosed, markAsOpen, positionExistsInTracker, updatePosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapExecutor } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";

type TxPreparationFailure = 'timed-out'|'already-sold'|'could-not-create-tx'|'could-not-retrieve-blockheight';
type TxExecutionFailure = 'tx-failed'|'unconfirmed'|'slippage-failed'|'insufficient-sol'|'frozen-token-account'|'token-fee-account-not-initialized'|'other-failed';

// See also SellConfirmer in sell_confirmer.ts for a full picture of the sell lifecycle

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

    private async sellInternal(position : Position) : Promise<TxPreparationFailure|TxExecutionFailure|'confirmed'> {
        
        if (this.isTimedOut()) {
            await this.markAsOpen(position);
            return 'timed-out';
        }

        // TODO: how do I avoid double-sells if the request to this DO is re-fired

        if (!(await this.positionExistsInTracker(position))) {
            return 'already-sold';
        }

        // get signed tx (signed does not mean executed, per se)
        const signedTx = await this.createSignedTx(position);

        if (signedTx == null) {
            await this.markAsOpen(position);
            return 'could-not-create-tx';
        }

        // get latest valid BH (tells us how long to keep trying to send tx)
        let lastValidBH = await getLatestValidBlockhash(this.connection, 3);

        // if failed, can't proceed.
        if (lastValidBH == null) {
            await this.markAsOpen(position);
            return 'could-not-retrieve-blockheight';
        }

        // update the tracker with Closing status, the sig & lastvalidBH for the sell.
        // this puts the Position into an 'Attempting Sale' state
        position.txSellSignature = signatureOf(signedTx);
        position.sellLastValidBlockheight = lastValidBH;
        position.status = PositionStatus.Closing;
        position.txSellAttemptTimeMS = Date.now();
        await updatePosition(position, this.env);

        // try to do the swap.
        const result = await this.executeAndParseSwap(position, signedTx, lastValidBH);

        // no guarantees that anything after this point executes... CF may drop it.

        await this.performTrackerActionBasedOnExecutionResult(position, result);

        if (isSuccessfullyParsedSwapSummary(result)) {
            return 'confirmed';
        }
        else {
            return result;
        }       
    }

    private async performTrackerActionBasedOnExecutionResult(position: Position, result : TxExecutionFailure|ParsedSuccessfulSwapSummary) {
        if (result === 'tx-failed') {
            await this.markAsOpen(position);
        }
        else if (result === 'slippage-failed') {
            await this.markAsOpen(position);
        }
        else if (result === 'frozen-token-account') {
            await this.markAsFrozen(position);
        }
        else if (result === 'insufficient-sol') {
            await this.markAsFrozen(position);
        }
        else if (result === 'token-fee-account-not-initialized') {
            await this.markAsFrozen(position);
        }
        else if (result === 'other-failed') {
            await this.incrementOtherSellFailureCountInTracker(position);
            await this.markAsOpen(position);
        }
        else if (result === 'unconfirmed') {
            // no-op --- sellConfirmer will pick it up on next CRON job execution.
        }
        else if (isSuccessfullyParsedSwapSummary(result)) {
            const netPNL = dSub(result.swapSummary.outTokenAmt, position.vsTokenAmt);
            await this.markAsClosed(position, netPNL);
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

    private async markAsFrozen(position : Position) {
        await deactivatePositionInTracker(position.positionID, position.token.address, position.vsToken.address, this.env);
    }

    private async incrementOtherSellFailureCountInTracker(position : Position) {
        await incrementOtherSellFailureCountInTracker(position.positionID, position.token.address, position.vsToken.address, this.env);
    }

    private async executeAndParseSwap(position : Position, signedTx : VersionedTransaction, lastValidBH : number) : Promise<'tx-failed'|'other-failed'|'slippage-failed'|'unconfirmed'|'frozen-token-account'|'insufficient-sol'|'token-fee-account-not-initialized'|ParsedSuccessfulSwapSummary> {
        
        // create a time-limited tx executor and confirmer
        const swapExecutor = new SwapExecutor(this.wallet, 'sell', this.env, this.channel, this.connection, lastValidBH, this.startTimeMS);

        // attempt to execute, confirm, and parse w/in time limit
        const parsedSwapSummary = await swapExecutor.executeTxAndParseResult(position, signedTx);

        // convert the tx execution result to a position, if possible
        if (parsedSwapSummary === 'tx-failed') {
            return 'tx-failed';
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
        else if (isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'token-fee-account-not-initialized';
        }
        else if (isInsufficientNativeTokensSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'insufficient-sol';
        }
        else if (isFrozenTokenAccountSwapExecutionErrorParseSummary(parsedSwapSummary)) {
            return 'frozen-token-account';
        }
        else if (isOtherKindOfSwapExecutionError(parsedSwapSummary)) {
            return 'other-failed';
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


    private makeFinalStatusMessage(position : Position, status : TxPreparationFailure|TxExecutionFailure|'confirmed') : string {
        switch(status) {
            case 'already-sold':
                return 'The position was already sold.';
            case 'confirmed':
                return 'The sale was successful!';
            case 'other-failed':
                return 'The sale failed.';
            case 'could-not-create-tx':
                return 'We could not create a transaction';
            case 'could-not-retrieve-blockheight':
                return 'We had trouble due to network congestion';
            case 'frozen-token-account':
                return 'This token has been frozen (most likely a rug) and the position has been deactivated.';
            case 'insufficient-sol':
                return 'There was not enough SOL in your account to cover transaction fees.  As a result, this position has been deactivated.  When you have deposited enough SOL to cover transaction fees you can reactivate the position.'
            case 'timed-out':
                return 'The transaction ran out of time to execute.';
            case 'token-fee-account-not-initialized':
                return 'There was an error executing the transaction.'
            case 'tx-failed':
                return 'There was an error executing the transaction.'
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

    private makeFinalMenuCode(status : TxPreparationFailure|TxExecutionFailure|'confirmed') : MenuCode {
        if (this.type === 'auto-sell') {
            return MenuCode.Close;
        }
        switch(status) {
            case 'already-sold':
                return MenuCode.ListPositions;
            case 'confirmed':
                return MenuCode.ViewPNLHistory;
            case 'other-failed':
                return MenuCode.ViewOpenPosition;
            case 'slippage-failed':
                return MenuCode.ViewOpenPosition;
            case 'unconfirmed':
                return MenuCode.ViewOpenPosition;
            case 'could-not-create-tx':
                return MenuCode.ViewOpenPosition;
            case 'could-not-retrieve-blockheight':
                return MenuCode.ViewOpenPosition;
            case 'frozen-token-account':
                return MenuCode.ViewFrozenPosition;
            case 'insufficient-sol':
                return MenuCode.ViewFrozenPosition;
            case 'timed-out':
                return MenuCode.ViewOpenPosition;
            case 'token-fee-account-not-initialized':
                return MenuCode.ViewOpenPosition;
            case 'tx-failed':
                return MenuCode.ViewOpenPosition;
            default:
                assertNever(status);
        }
    }    
}