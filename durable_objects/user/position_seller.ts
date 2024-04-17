import { Connection, SimulateTransactionConfig, VersionedTransaction } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { DecimalizedAmount, dSub } from "../../decimalized";
import { asTokenPrice } from "../../decimalized/decimalized_amount";
import { Env } from "../../env";
import { logError } from "../../logging";
import { MenuCode } from "../../menus";
import { Position, PositionStatus } from "../../positions";
import { getLatestValidBlockhash } from "../../rpc/rpc_blocks";
import { parseInstructionError } from "../../rpc/rpc_parse_instruction_error";
import { signatureOf } from "../../rpc/rpc_sign_tx";
import { ParsedSuccessfulSwapSummary, SwapExecutionError, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isInsufficientTokensBalanceErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever, strictParseBoolean, strictParseInt } from "../../util";
import { deactivatePositionInTracker, incrementOtherSellFailureCountInTracker, markAsClosed, markAsOpen, positionExistsInTracker, updatePosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapExecutor } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";
import { doubleSellSlippageAndMarkAsOpen } from "./userDO_interop";

type TxPreparationFailure = 'timed-out'|'already-sold'|'could-not-create-tx'|'could-not-retrieve-blockheight';
type TxSimFailure = 'tx-sim-failed-other'|'tx-sim-failed-other-too-many-times'|'tx-sim-insufficient-sol'|'tx-sim-failed-slippage'|'tx-sim-frozen-token-account'|'tx-sim-failed-token-account-fee-not-initialized'|'tx-sim-insufficient-tokens-balance';
type TxExecutionFailure = 'tx-failed'|'unconfirmed'|'slippage-failed'|'insufficient-sol'|'insufficient-tokens-balance'|'frozen-token-account'|'token-fee-account-not-initialized'|'other-failed'|'other-failed-too-many-times';

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
        catch (e) {
            logError(e);
            const menuCode = this.type === 'manual-sell' ? MenuCode.ViewOpenPosition : MenuCode.Close;
            TGStatusMessage.queue(this.channel, "There was an unexpected error.", menuCode, position.positionID);
        }
    }

    private async sellInternal(position : Position) : Promise<TxPreparationFailure|TxSimFailure|TxExecutionFailure|'confirmed'> {
        
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
        
        if (strictParseBoolean(this.env.TX_SIM_BEFORE_BUY)) {
            const txSimResult = await this.simulateTx(signedTx, position, this.connection);
            if (txSimResult !== 'success') {
                await this.performTrackerActionBasedOnExecutionResult(position, txSimResult);
                return txSimResult;
            }
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

    private async performTrackerActionBasedOnExecutionResult(position: Position, result : TxSimFailure|TxExecutionFailure|ParsedSuccessfulSwapSummary) {
        if (result === 'tx-failed') {
            await this.markAsOpen(position);
        }
        else if (result === 'slippage-failed' || result === 'tx-sim-failed-slippage') {
            await this.markAsOpenAndDoubleSlippage(position);
        }
        else if (result === 'frozen-token-account' || result === 'tx-sim-frozen-token-account') {
            await this.markAsOpenAndDeactivate(position);
        }
        else if (result === 'insufficient-sol' || result === 'tx-sim-insufficient-sol') {
            await this.markAsOpenAndDeactivate(position);
        }
        else if (result === 'token-fee-account-not-initialized' || result === 'tx-sim-failed-token-account-fee-not-initialized') {
            await this.markAsOpenAndDeactivate(position);
        }
        else if (result === 'tx-sim-insufficient-tokens-balance' || result === 'insufficient-tokens-balance') {
            await this.markAsOpenAndDeactivate(position);
        }
        else if (result === 'other-failed' || result === 'tx-sim-failed-other') {
            await this.incrementOtherSellFailureCountInTracker(position);
            await this.markAsOpen(position);
        }
        else if (result === 'other-failed-too-many-times' || result === 'tx-sim-failed-other-too-many-times') {
            await this.markAsOpenAndDeactivate(position);
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

    private async markAsOpenAndDeactivate(position : Position) {
        // We mark as open before deactivating so that, if reactivated, it isn't in a 'try to confirm' state
        // At this point, if 'markAsDeactivated' is invoked, we know that the sale failed and trying to confirm upon reactivation is superfluous 
        const markAsOpenBeforeDeactivating = true;
        await deactivatePositionInTracker(position.positionID, position.token.address, position.vsToken.address, markAsOpenBeforeDeactivating, this.env);
    }

    private async markAsOpenAndDoubleSlippage(position : Position) {
        await doubleSellSlippageAndMarkAsOpen(position.userID, position.chatID, position.positionID, this.env);
    }

    private async incrementOtherSellFailureCountInTracker(position : Position) {
        await incrementOtherSellFailureCountInTracker(position.positionID, position.token.address, position.vsToken.address, this.env);
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

    private async positionExistsInTracker(position : Position) : Promise<boolean> {
        return (await positionExistsInTracker(position.positionID, position.token.address, position.vsToken.address, this.env))
    }

    private async markAsOpen(position : Position) {
        await markAsOpen(position.positionID, position.token.address, position.vsToken.address, this.env);
    }

    private async markAsClosed(position : Position, netPNL : DecimalizedAmount) {
        await markAsClosed(position.positionID, position.token.address, position.vsToken.address, netPNL, this.env);
    }


    private makeFinalStatusMessage(position : Position, status : TxPreparationFailure|TxSimFailure|TxExecutionFailure|'confirmed') : string {
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
                return 'There was not enough SOL in your account to cover transaction fees.  As a result, this position has been deactivated.  When you have deposited enough SOL to cover transaction fees you can reactivate the position.'
            case 'timed-out':
                return 'The transaction ran out of time to execute.';
            case 'tx-sim-failed-token-account-fee-not-initialized':
            case 'token-fee-account-not-initialized':
                return 'There was a critical error executing the transaction and the position has been marked as deactivated.'
            case 'tx-failed':
                return 'There was an error executing the transaction.'
            case 'tx-sim-failed-slippage':
            case 'slippage-failed':
                if (this.type === 'auto-sell' && position.sellAutoDoubleSlippage) {
                    return `The sale failed due to slippage - the sale will be reattempted with slippage of ${Math.min(100,position.sellSlippagePercent * 2).toFixed(1)}%.`;
                }
                else if (this.type === 'auto-sell') {
                    return 'The sale failed due to slippage. If the trigger condition holds the sale will be reattempted automatically.'
                }
                else {
                    return 'The sale failed due to slippage tolerance being exceeded.'
                }
            case 'unconfirmed':
                return 'The sale could not be confirmed due to network congestion. We will reattempt confirmation within a few minutes.';
            case 'tx-sim-insufficient-tokens-balance':
            case 'insufficient-tokens-balance':
                return `There were not enough tokens in your wallet to cover the sale of ${asTokenPrice(position.tokenAmt)} $${position.token.symbol}, so this position has been deactivated.`
            default:
                assertNever(status);
        }
    }

    private makeFinalMenuCode(status : TxPreparationFailure|TxSimFailure|TxExecutionFailure|'confirmed') : MenuCode {
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
            default:
                assertNever(status);
        }
    }  
    
    private async simulateTx(signedTx : VersionedTransaction, position : Position, connection : Connection) : Promise<'success'|TxSimFailure> {
        
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
            if ((position.otherSellFailureCount||0)+1 >= strictParseInt(this.env.OTHER_SELL_FAILURES_TO_DEACTIVATE)) {
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