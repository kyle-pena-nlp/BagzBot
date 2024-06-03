import { Connection, SimulateTransactionConfig, VersionedTransaction } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { dSub } from "../../decimalized";
import { DecimalizedAmount, asTokenPrice } from "../../decimalized/decimalized_amount";
import { Env } from "../../env";
import { MenuCode } from "../../menus";
import { Position, PositionStatus } from "../../positions";
import { getLatestValidBlockhash } from "../../rpc/rpc_blocks";
import { parseInstructionError } from "../../rpc/rpc_parse_instruction_error";
import { signatureOf } from "../../rpc/rpc_sign_tx";
import { ParsedSuccessfulSwapSummary, SwapExecutionError, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isInsufficientTokensBalanceErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever, strictParseBoolean, strictParseInt } from "../../util";
//import { deactivatePositionInTracker, incrementOtherSellFailureCountInTracker, markAsClosed, markAsOpen, positionExistsInTracker, updatePosition } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { SwapExecutor } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";
import { ClosedPositionsTracker } from "./trackers/closed_positions_tracker";
import { DeactivatedPositionsTracker } from "./trackers/deactivated_positions_tracker";
import { OpenPositionsTracker } from "./trackers/open_positions_tracker";

type TxPreparationFailure = 'timed-out'|'already-sold'|'could-not-create-tx'|'could-not-retrieve-blockheight';
type TxSimFailure = 'tx-sim-failed-other'|'tx-sim-failed-other-too-many-times'|'tx-sim-insufficient-sol'|'tx-sim-failed-slippage'|'tx-sim-frozen-token-account'|'tx-sim-failed-token-account-fee-not-initialized'|'tx-sim-insufficient-tokens-balance';
type TxExecutionFailure = 'tx-failed'|'unconfirmed'|'slippage-failed'|'insufficient-sol'|'insufficient-tokens-balance'|'frozen-token-account'|'token-fee-account-not-initialized'|'other-failed'|'other-failed-too-many-times';

export interface PreparedSellTx {
    signedTx : VersionedTransaction,
    lastValidBH : number
}

export function isPreparedSellTx(obj : PreparedSellTx|string) : obj is PreparedSellTx {
    return typeof obj !== 'string';
}

// See also SellConfirmer in sell_confirmer.ts for a full picture of the sell lifecycle

export class PositionSeller {
    connection : Connection
    wallet : Wallet
    type : 'manual-sell'|'auto-sell'
    startTimeMS : number
    channel : UpdateableNotification
    env : Env
    openPositions : OpenPositionsTracker
    closedPositions: ClosedPositionsTracker
    deactivatedPositions: DeactivatedPositionsTracker
    constructor(
        connection : Connection, 
        wallet : Wallet, 
        type : 'manual-sell'|'auto-sell', 
        startTimeMS : number, 
        channel : UpdateableNotification, 
        env : Env,
        openPositions : OpenPositionsTracker,
        closedPositions: ClosedPositionsTracker,
        deactivatedPositions: DeactivatedPositionsTracker
    ) {
        this.connection = connection;
        this.wallet = wallet;
        this.type = type
        this.startTimeMS = startTimeMS;
        this.channel = channel;
        this.env = env;
        this.openPositions = openPositions;
        this.closedPositions = closedPositions;
        this.deactivatedPositions = deactivatedPositions;
    }

    isTimedOut() : boolean {
        return Date.now() > (this.startTimeMS + strictParseInt(this.env.TX_TIMEOUT_MS));
    }

    async prepareAndSimTx(positionID : string) : Promise<TxPreparationFailure|TxSimFailure|PreparedSellTx> {

        if (this.isTimedOut()) {
            this.markAsOpen(positionID);
            return 'timed-out';
        }

        // TODO: how do I avoid double-sells if the request to this DO is re-fired

        // This code isn't entirely appropraite (the position might have also been deactivated)
        if (!(this.positionExistsInTracker(positionID))) {
            return 'already-sold';
        }

        // get signed tx (signed does not mean executed, per se)
        const signedTx = await this.createSignedTx(positionID);

        if (signedTx == null) {
            this.markAsOpen(positionID);
            return 'could-not-create-tx';
        }
        
        if (strictParseBoolean(this.env.TX_SIM_BEFORE_BUY)) {
            const txSimResult = await this.simulateTx(signedTx, positionID, this.connection);
            if (txSimResult !== 'success') {
                this.performTrackerActionBasedOnExecutionResult(positionID, txSimResult);
                return txSimResult;
            }
        }

        // get latest valid BH (tells us how long to keep trying to send tx)
        let lastValidBH = await getLatestValidBlockhash(this.connection, 3);

        // if failed, can't proceed.
        if (lastValidBH == null) {
            this.markAsOpen(positionID);
            return 'could-not-retrieve-blockheight';
        }

        // update the tracker with Closing status, the sig & lastvalidBH for the sell.
        // this puts the Position into an 'Attempting Sale' state
        // this prevents it from being picked up by something else
        const position = this.openPositions.mutatePosition(positionID, p => {
            p.txSellSignature = signatureOf(signedTx);
            p.sellLastValidBlockheight = lastValidBH;
            p.txSellAttemptTimeMS = Date.now();
        });

        // if the position DNE now (something happened during an await) then early out.
        if (position == null) {
            return 'could-not-create-tx';
        }

        return { signedTx, lastValidBH }
    }

    async executeTx(positionID : string, preparedSellTx : PreparedSellTx) : Promise<TxExecutionFailure|ParsedSuccessfulSwapSummary> {

        // how should i deal with the position disappearing here? will this happen?
        const position = this.openPositions.get(positionID)!!;

        const result = await this.executeAndParseSwap(position, preparedSellTx.signedTx, preparedSellTx.lastValidBH);

        return result;
    }

    async finalize(positionID : string, result : TxPreparationFailure|TxSimFailure|TxExecutionFailure|'unexpected-failure'|ParsedSuccessfulSwapSummary) {
        this.performTrackerActionBasedOnExecutionResult(positionID, result);
        const status = isSuccessfullyParsedSwapSummary(result) ? 'confirmed' : result;
        const statusMessage = this.makeFinalStatusMessage(positionID, status);
        const menuCode = this.makeFinalMenuCode(status);
        TGStatusMessage.queue(this.channel, statusMessage, menuCode, positionID);
        await TGStatusMessage.finalize(this.channel);
    }

    private performTrackerActionBasedOnExecutionResult(positionID : string, result : TxPreparationFailure|TxSimFailure|TxExecutionFailure|'unexpected-failure'|ParsedSuccessfulSwapSummary) {
        if (result === 'timed-out') {
            // no-op, was an early out.
            this.markAsOpen(positionID);
        }
        else if (result === 'already-sold') {
            // no-op, was an early out.
            this.markAsOpen(positionID);
        }
        else if (result === 'could-not-create-tx') {
            // no-op, was an early out.
            this.markAsOpen(positionID);
        }
        else if (result === 'could-not-retrieve-blockheight') {
            // no-op, was an early out.
            this.markAsOpen(positionID);
        }
        else if (result === 'tx-sim-failed-slippage') {
            // was an early out, but indicates slippage should be doubled if desired
            this.markAsOpenAndMaybeDoubleSlippage(positionID);
        }
        else if (result === 'tx-sim-frozen-token-account') {
            // was an early out, but indicates position should be deactivated
            this.markAsOpenAndDeactivate(positionID)
        }
        else if (result === 'tx-sim-insufficient-sol') {
            // was an early out, but indicates position should be deactivated
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'tx-sim-insufficient-tokens-balance') {
            // was an early out, but indicates position should be deactivated
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'tx-sim-failed-other') {
            this.markAsOpenAndIncrementOtherSellFailureCountInTracker(positionID);
        }
        else if (result === 'tx-sim-failed-other-too-many-times') {
            // was an early out, but indicates position should be deactivated
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'tx-sim-failed-token-account-fee-not-initialized') {
            // was an early out, but indicates position should be deactivated
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'tx-failed') {
            this.markAsOpen(positionID);
        }
        else if (result === 'slippage-failed') {
            this.markAsOpenAndMaybeDoubleSlippage(positionID);
        }
        else if (result === 'frozen-token-account') {
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'insufficient-sol') {
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'token-fee-account-not-initialized') {
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'insufficient-tokens-balance') {
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'other-failed') {
            this.markAsOpenAndIncrementOtherSellFailureCountInTracker(positionID);
        }
        else if (result === 'other-failed-too-many-times') {
            this.markAsOpenAndDeactivate(positionID);
        }
        else if (result === 'unconfirmed') {
            // no-op --- sellConfirmer will pick it up on next CRON job execution.
        }
        else if (result === 'unexpected-failure') {
            // no-op --- who knows what state we were left in?  let the confirmer deal with it.
        }
        else if (isSuccessfullyParsedSwapSummary(result)) {
            this.markAsClosed(positionID, result);
        }
        else {
            assertNever(result);
        }         
    }
  
    private async createSignedTx(positionID : string) : Promise<VersionedTransaction|undefined> {
        const swapTxSigner = new SwapTransactionSigner(this.wallet, this.env, this.channel);
        const position = this.openPositions.get(positionID);
        if (position == null) {
            return undefined;
        }
        const signedTx = await swapTxSigner.createAndSign(position);
        return signedTx;
    }

    private markAsOpenAndDeactivate(positionID : string) : boolean {
        // We mark as open before deactivating so that, if reactivated, it isn't in a 'try to confirm' state
        // At this point, if 'markAsDeactivated' is invoked, we know that the sale failed and trying to confirm upon reactivation is superfluous 
        this.openPositions.mutatePosition(positionID, p => {
            p.status = PositionStatus.Open;
        });
        this.deactivate(positionID);
        return true;
    }

    private deactivate(positionID : string) : boolean {
        const position = this.openPositions.deactivateAndReturn(positionID);
        if (position == null) {
            return false;
        }
        this.deactivatedPositions.upsert(position);
        return true;
    }

    private markAsOpenAndMaybeDoubleSlippage(positionID : string) {
        this.markAsOpen(positionID);
        this.maybeDoubleSlippage(positionID);
    }

    private maybeDoubleSlippage(positionID : string) {
        const shouldAutodouble = this.openPositions.getProperty(positionID, p => p.sellAutoDoubleSlippage);
        if (shouldAutodouble === true) {
            this.openPositions.mutatePosition(positionID, p => {
                p.sellSlippagePercent = Math.min(100, 2 * p.sellSlippagePercent);
            });
        }
    }

    private markAsOpenAndIncrementOtherSellFailureCountInTracker(positionID : string) {
        this.markAsOpen(positionID);
        this.openPositions.mutatePosition(positionID, p => {
            p.otherSellFailureCount = (p.otherSellFailureCount||0) + 1
        });
    }

    private async executeAndParseSwap(position : Position, signedTx : VersionedTransaction, lastValidBH : number) : Promise<
        'tx-failed'|
        'other-failed'|
        'slippage-failed'|
        'unconfirmed'|
        'frozen-token-account'|
        'insufficient-sol'|
        'token-fee-account-not-initialized'|
        'insufficient-tokens-balance'|
        'other-failed-too-many-times'|
        ParsedSuccessfulSwapSummary> {

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
        else if (isInsufficientTokensBalanceErrorParseSummary(parsedSwapSummary)) {
            return 'insufficient-tokens-balance';
        }
        else if (isOtherKindOfSwapExecutionError(parsedSwapSummary)) {
            if ((position.otherSellFailureCount||0)+1 >= strictParseInt(this.env.OTHER_SELL_FAILURES_TO_DEACTIVATE)) {
                return 'other-failed-too-many-times';
            }
            else {
                return 'other-failed';
            }
        }        
        else if (isSuccessfulSwapSummary(parsedSwapSummary)) {
            return parsedSwapSummary;
        }
        else {
            assertNever(parsedSwapSummary);
        }
    }

    private positionExistsInTracker(positionID : string) : boolean {
        return this.openPositions.has(positionID);
    }

    private markAsOpen(positionID : string) {
        this.openPositions.mutatePosition(positionID, p => {
            p.status = PositionStatus.Open;
        });
    }

    private markAsClosed(positionID : string, swapSummary : ParsedSuccessfulSwapSummary) {
        const position = this.openPositions.markAsClosedAndReturn(positionID);
        if (position == null) {
            return;
        }
        const netPNL = dSub(swapSummary.swapSummary.outTokenAmt, position.vsTokenAmt);
        position.netPNL = netPNL;
        this.closedPositions.upsert(position as (Position & { netPNL : DecimalizedAmount })); // not sure why TS couldn't figure this out
    }


    private makeFinalStatusMessage(positionID : string, status : TxPreparationFailure|TxSimFailure|TxExecutionFailure|'unexpected-failure'|'confirmed') : string {
        switch(status) {
            case 'already-sold':
                return 'The position was already sold.';
            case 'confirmed':
                return 'The sale was successful!';
            case 'tx-sim-failed-other':
            case 'other-failed':
                return 'The sale failed for an unknown reason.';
            case 'tx-sim-failed-other-too-many-times':
            case 'other-failed-too-many-times':
                return 'The sale failed for an unknown reason too many times and will be deactivated.';
            case 'could-not-create-tx':
                return 'We could not create a transaction';
            case 'could-not-retrieve-blockheight':
                return 'We had trouble due to network congestion';
            case 'tx-sim-frozen-token-account':
            case 'frozen-token-account':
                return 'This token has been frozen (most likely a rug) and the position has been deactivated.';
            case 'tx-sim-insufficient-sol':
            case 'insufficient-sol':
                return 'There was not enough SOL in your account to cover transaction fees, or there were not enough tokens to cover the sale.  As a result, this position has been deactivated.  When you have deposited enough SOL to cover transaction fees you can reactivate the position.'
            case 'timed-out':
                return 'The transaction ran out of time to execute.';
            case 'tx-sim-failed-token-account-fee-not-initialized':
            case 'token-fee-account-not-initialized':
                return 'There was a critical error executing the transaction and the position has been marked as deactivated.'
            case 'tx-failed':
                return 'There was an error executing the transaction.'
            case 'tx-sim-failed-slippage':
            case 'slippage-failed':
                const position = this.openPositions.get(positionID) || this.deactivatedPositions.get(positionID) || this.closedPositions.get(positionID);
                if (this.type === 'auto-sell' && position != null && position.sellAutoDoubleSlippage) {
                    return `The sale failed due to slippage - If the trigger condition holds the sale will be reattempted with slippage of ${Math.min(100,position.sellSlippagePercent * 2).toFixed(1)}%.`;
                }
                else if (this.type === 'auto-sell') {
                    return 'The sale failed due to slippage. If the trigger condition holds the sale will be reattempted automatically.'
                }
                else {
                    return 'The sale failed due to slippage tolerance being exceeded.'
                }
            case 'unconfirmed':
                return 'The sale could not be confirmed due to network congestion. We will reattempt confirmation within a few minutes.';
            case 'unexpected-failure':
                return 'There was an unexpected error.';
            case 'tx-sim-insufficient-tokens-balance':
            case 'insufficient-tokens-balance':
                const pos = this.openPositions.get(positionID) || this.deactivatedPositions.get(positionID) || this.closedPositions.get(positionID);
                if (pos != null) {
                    return `There were not enough tokens in your wallet to cover the sale of ${asTokenPrice(pos.tokenAmt)} $${pos.token.symbol}, so this position has been deactivated.`
                }
                else {
                    return `There were not enough tokens in your wallet to cover the sale of this position.`;
                }
            default:
                assertNever(status);
        }
    }

    private makeFinalMenuCode(status : TxPreparationFailure|TxSimFailure|TxExecutionFailure|'unexpected-failure'|'confirmed') : MenuCode {
        if (this.type === 'auto-sell') {
            return MenuCode.Close;
        }
        switch(status) {
            case 'already-sold':
                return MenuCode.ListPositions;
            case 'confirmed':
                return MenuCode.ViewPNLHistory;

            case 'tx-sim-failed-slippage':
            case 'slippage-failed':
                return MenuCode.ViewOpenPosition;
            case 'unconfirmed':
                return MenuCode.ViewOpenPosition;
            case 'could-not-create-tx':
                return MenuCode.ViewOpenPosition;
            case 'could-not-retrieve-blockheight':
                return MenuCode.ViewOpenPosition;
            case 'tx-sim-frozen-token-account':
            case 'frozen-token-account':
                return MenuCode.ViewDeactivatedPosition;
            case 'tx-sim-insufficient-sol':
            case 'insufficient-sol':
                return MenuCode.ViewDeactivatedPosition;
            case 'timed-out':
                return MenuCode.ViewOpenPosition;
            case 'tx-sim-failed-token-account-fee-not-initialized':
            case 'token-fee-account-not-initialized':
                return MenuCode.ViewOpenPosition;
            case 'tx-failed':
                return MenuCode.ViewOpenPosition;
            case 'tx-sim-failed-other':
            case 'other-failed':
                return MenuCode.ViewOpenPosition;
            case 'tx-sim-failed-other-too-many-times':
            case 'other-failed-too-many-times':
                return MenuCode.ViewDeactivatedPositions;
            case 'tx-sim-insufficient-tokens-balance':
            case 'insufficient-tokens-balance':
                return MenuCode.ViewDeactivatedPositions;
            case 'unexpected-failure':
                return this.type === 'manual-sell' ? MenuCode.ViewOpenPosition : MenuCode.Close;
            default:
                assertNever(status);
        }
    }  
    
    private async simulateTx(signedTx : VersionedTransaction, positionID : string, connection : Connection) : Promise<'success'|TxSimFailure> {
        
        const config: SimulateTransactionConfig = {
            sigVerify: true, // use the signature of the signedTx to verify validity of tx, rather than fetching a new blockhash
            commitment: 'confirmed' // omitting this seems to cause simulation to fail.
        };

        const response = await connection.simulateTransaction(signedTx, config);

        if (!response.value.err) {
            return 'success';
        }

        const swapExecutionError =  parseInstructionError(response.value.err, this.env);

        if (swapExecutionError === SwapExecutionError.InsufficientSOLBalance) {
            return 'tx-sim-insufficient-sol';
        }
        else if (swapExecutionError === SwapExecutionError.SlippageToleranceExceeded) {
            return 'tx-sim-failed-slippage';
        }
        else if (swapExecutionError === SwapExecutionError.TokenAccountFeeNotInitialized) {
            return 'tx-sim-failed-token-account-fee-not-initialized';
        }
        else if (swapExecutionError === SwapExecutionError.FrozenTokenAccount) {
            return 'tx-sim-frozen-token-account';
        }
        else if (swapExecutionError === SwapExecutionError.OtherSwapExecutionError) {
            const otherSellFailureCount = this.openPositions.getProperty(positionID, p => p.otherSellFailureCount);
            if ((otherSellFailureCount != null && otherSellFailureCount + 1 >= strictParseInt(this.env.OTHER_SELL_FAILURES_TO_DEACTIVATE))) {
                return 'tx-sim-failed-other-too-many-times';
            }
            else {
                return 'tx-sim-failed-other';
            }
        }
        else if (swapExecutionError === SwapExecutionError.InsufficientTokensBalance) {
            return 'tx-sim-insufficient-tokens-balance';
        }     
        else {
            assertNever(swapExecutionError);
        }        
    }    
}