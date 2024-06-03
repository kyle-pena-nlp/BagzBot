import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { dSub } from "../../../decimalized";
import { DecimalizedAmount, asTokenPrice, asTokenPriceDelta } from "../../../decimalized/decimalized_amount";
import { Env } from "../../../env";
import { logDebug, logError } from "../../../logging";
import { MenuCode } from "../../../menus";
import { Position, PositionStatus } from "../../../positions";
import { ParseTransactionParams, parseParsedTransactionWithMeta } from "../../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, ParsedSwapSummary, UnknownTransactionParseSummary, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isInsufficientTokensBalanceErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary } from "../../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage } from "../../../telegram";
import { UpdateableMessage } from "../../../telegram/telegram_status_message";
import { assertNever, strictParseBoolean, strictParseInt } from "../../../util";
import { ClosedPositionsTracker } from "../trackers/closed_positions_tracker";
import { DeactivatedPositionsTracker } from "../trackers/deactivated_positions_tracker";
import { OpenPositionsTracker } from "../trackers/open_positions_tracker";

type SellConfirmationErrorCode = 'timed-out'|
    '429'|
    'api-call-error'|
    'no-sell-tx'|
    'no-sell-signature'|
    'position-DNE'|
    'sell-already-confirmed'|
    'position-not-closing'|
    'no-sell-last-valid-blockheight';

type SellTxErrorCode = 'tx-was-dropped'|
    'slippage-failed'|
    'other-failed'|
    'unconfirmed'|
    'frozen-token-account'|
    'token-fee-account-not-initialized'|
    'insufficient-sol'|
    'insufficient-tokens-balance';

type SellConfirmResult = SellConfirmationErrorCode|SellTxErrorCode|ParsedSuccessfulSwapSummary;

export class UserDOSellConfirmer {
    channel : UpdateableMessage
    connection : Connection
    startTimeMS : number
    env : Env
    openPositions : OpenPositionsTracker;
    closedPositions : ClosedPositionsTracker;
    deactivatedPositions : DeactivatedPositionsTracker;
    constructor(
        channel : UpdateableMessage,
        connection : Connection, 
        startTimeMS : number, 
        env : Env,
        openPositions : OpenPositionsTracker,
        closedPositions : ClosedPositionsTracker,
        deactivatedPositions : DeactivatedPositionsTracker
    ) {
        this.channel = channel;
        this.connection = connection;
        this.startTimeMS = startTimeMS;
        this.env = env;
        this.openPositions = openPositions;
        this.closedPositions = closedPositions;
        this.deactivatedPositions = deactivatedPositions;
    }
    isTimedOut() : boolean {
        return (Date.now() > this.startTimeMS + strictParseInt(this.env.CONFIRM_TIMEOUT_MS));
    }   
    async maybeConfirmSell(positionID : string) : Promise<SellConfirmResult> {

        // if timed out, early-out
        if (this.isTimedOut()) {
            this.markAsNotConfirmingSell(positionID);
            return 'timed-out';
        }

        // try to get the blockheight, early-out if you can't (RPC api is down or 429'ed)
        const blockheight : number | 'api-call-error' | '429' = await this.getBlockheight();
        if (blockheight === '429') {
            this.markAsNotConfirmingSell(positionID);
            return '429';
        }
        else if (blockheight === 'api-call-error') {
            this.markAsNotConfirmingSell(positionID);
            return 'api-call-error';
        }        

        // if there was never a tx sig recorded, the sell tx was never sent, so just mark it as open again.
        if (this.noSellTxRecorded(positionID) === true) {
            this.openPositions.mutatePosition(positionID, p => {
                p.txSellSignature = null;
                p.txSellAttemptTimeMS = null;
                p.sellLastValidBlockheight = null;
                p.sellConfirming = false;
                p.status = PositionStatus.Open;
            });
            return 'no-sell-signature';
        }

        // recheck status of position because we are in any async method
        let confirmableStatus = this.isSellConfirmable(positionID);
        if (confirmableStatus !== 'confirmable') {
            this.markAsNotConfirmingSell(positionID);
            return confirmableStatus;
        }
        else if (typeof blockheight === 'number') {
            const confirmationData = await this.attemptConfirmation(positionID, blockheight);
            return confirmationData;
            //await this.performSellConfirmationAction(positionID, confirmationData);
            //return 'continue';
        }
        else {
            assertNever(blockheight);
        }
    }
    private noSellTxRecorded(positionID : string) : boolean|null {
        const checkPosition = this.openPositions.get(positionID);
        if (checkPosition == null) {
            return null;
        }
        if (checkPosition.txSellSignature == null) {
            return true;
        }
        if (checkPosition.sellLastValidBlockheight == null) {
            return true;
        }
        if (checkPosition.txSellAttemptTimeMS) {
            return true;
        }
        return false;
    }
    makeTelegramSellConfirmationChannel(positionID : string) {
        const pos = this.openPositions.get(positionID)!!;
        const sellConfirmPrefix = `:notify: <b>Attempting to confirm the earlier sale of ${asTokenPrice(pos.tokenAmt)} $${pos.token.symbol}</b>: `;
        const channel = TGStatusMessage.createAndSend('In progress...', false, pos.chatID, this.env, 'HTML', sellConfirmPrefix);
        return channel;
    }
    async finalize(positionID : string, status: SellConfirmResult) {

        // since we are entering an async we need to recheck it's confirmable
        const recheck = this.isSellConfirmable(positionID);
        if (recheck !== 'confirmable') {
            status = recheck;
        }

        if (status === 'unconfirmed') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "Confirmation not complete - we will continue soon.", true);
            // no action on position in tracker because could not confirm outcome
        }
        else if (status === 'tx-was-dropped') {
            this.markPositionAsOpenAndNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We found that the sale didn't go through.", true);               
        }
        else if (status === 'other-failed') {
            const max_other_sell_failures = strictParseInt(this.env.OTHER_SELL_FAILURES_TO_DEACTIVATE);
            const otherSellFailureCount = this.openPositions.getProperty(positionID, p => p.otherSellFailureCount)||0;
            if (otherSellFailureCount+1 >= max_other_sell_failures) {
                this.markPositionAsOpenAndNotConfirmingSell(positionID);
                this.deactivatePosition(positionID);
                await TGStatusMessage.finalMessage(this.channel, `Sale of this position failed for an unknown reason ${max_other_sell_failures} or more times, so this position will be deactivated.`, MenuCode.ViewDeactivatedPositions);                        
            }
            else {
                this.openPositions.mutatePosition(positionID, p => {
                    p.otherSellFailureCount = otherSellFailureCount+1
                });
                this.markPositionAsOpenAndNotConfirmingSell(positionID);
                await TGStatusMessage.finalMessage(this.channel, "We found that the sale didn't go through.", true);
            }
        }
        else if (status === 'slippage-failed') {
            const { sellAutoDoubleSlippage, sellSlippagePercent } = this.openPositions.getProperty(positionID, p => { p.sellAutoDoubleSlippage, p.sellSlippagePercent } )!!;
            if (sellAutoDoubleSlippage && strictParseBoolean(this.env.ALLOW_CHOOSE_AUTO_DOUBLE_SLIPPAGE)) {
                const maxSlippage = 100;
                const updatedSellSlippagePercent = Math.min(maxSlippage, 2 * sellSlippagePercent);
                this.openPositions.mutatePosition(positionID, p => {
                    p.sellSlippagePercent = updatedSellSlippagePercent;
                })
                this.markPositionAsOpenAndNotConfirmingSell(positionID);
                await TGStatusMessage.finalMessage(this.channel, `The sale failed due to slippage.  We have increased the slippage to ${updatedSellSlippagePercent}% and will retry the sale if the trigger conditions holds.`, true);
            }
            else {
                const triggerPercent = this.openPositions.getProperty(positionID, p => p.triggerPercent)!!;
                this.markPositionAsOpenAndNotConfirmingSell(positionID);
                await TGStatusMessage.finalMessage(this.channel, `The sale failed due to slippage. We will re-sell if the price continues to stay ${triggerPercent.toFixed(1)}% below the peak.`, true);
            }
        }
        else if (status === 'frozen-token-account') {
            this.markPositionAsOpenAndNotConfirmingSell(positionID);
            this.deactivatePosition(positionID);
            await TGStatusMessage.finalMessage(this.channel, "The sale didn't go through because this token has been frozen (most likely it was rugged).  The position has been deactivated.", true);
        }
        else if (status === 'insufficient-sol') {
            this.markPositionAsOpenAndNotConfirmingSell(positionID);
            this.deactivatePosition(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We found that the sale didn't go through because there wasn't enough SOL in your wallet to cover transaction fees. The position has been deactivated.", true);
        }
        else if (status === 'token-fee-account-not-initialized') {
            this.markPositionAsOpenAndNotConfirmingSell(positionID);
            this.deactivatePosition(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We found that the sale didn't go through because of an error on our platform. The position has been deactivated.", true);
        }
        else if (status === 'insufficient-tokens-balance') {
            this.markPositionAsOpenAndNotConfirmingSell(positionID);
            this.deactivatePosition(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We found that the sale didn't go through because there were not enough tokens in your wallet to cover the sale. The position has been deactivated.", true);
        }
        else if (status === 'position-DNE') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We found that the position no longer exists, or has been deactivated or closed.", true);
        }
        else if (status === 'no-sell-last-valid-blockheight') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We could not confirm the sale.", true);
        }
        else if (status === 'no-sell-signature') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We could not confirm the sale.", true);
        }
        else if (status === 'position-not-closing') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We found that the position is no longer being sold.", true);
        }
        else if (status === 'sell-already-confirmed') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "The sale has been confirmed!", true);
        }
        else if (isSuccessfullyParsedSwapSummary(status)) {
            // TODO: update with PnL    
            const pos = this.openPositions.get(positionID)!!;           
            const netPNL = dSub(status.swapSummary.outTokenAmt, pos.vsTokenAmt);
            this.closePosition(positionID, netPNL);
            await TGStatusMessage.finalMessage(this.channel, `The sale was confirmed! You made ${asTokenPriceDelta(netPNL)} SOL.`, MenuCode.ViewPNLHistory); 
        }
        else if (status === '429') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "The sale could not be confirmed because the RPC was temporarily unavailable.  We will try again soon.", true);
        }
        else if (status === 'api-call-error') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "The sale could not be confirmed because the RPC was temporarily unavailable.  We will try again soon.", true);
        }
        else if (status === 'no-sell-tx') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "It looks like the transaction was never sent.  We will re-attempt the sale if the trigger condition is met.", true);
            // not sure what else should be done here.

        }
        else if (status === 'timed-out') {
            this.markAsNotConfirmingSell(positionID);
            await TGStatusMessage.finalMessage(this.channel, "We ran out of time to confirm the sale.  We will try again soon.", true);
        }
        else {
            assertNever(status);
        }
    }
    closePosition(positionID: string, netPNL: DecimalizedAmount) {
        const position = this.openPositions.markAsClosedAndReturn(positionID);
        if (position != null) {
            position.netPNL = netPNL;
            position.sellConfirming = false;
            position.sellConfirmed = true;
            this.closedPositions.upsert(position as (Position & { netPNL : DecimalizedAmount })); // not sure why TS couldn't figure this out
        }
    }
    deactivatePosition(positionID: string) {
        const position = this.openPositions.deactivateAndReturn(positionID);
        if (position != null) {
            this.deactivatedPositions.upsert(position);
        }
    }
    markPositionAsOpenAndNotConfirmingSell(positionID: string) {
        this.markAsNotConfirmingSell(positionID);
        this.openPositions.markAsOpenAndReturn(positionID);
    }

    markAsNotConfirmingSell(positionID : string) {
        this.openPositions.mutatePosition(positionID, p => {
            p.sellConfirming = false;
        });
    }

    private async getBlockheight() : Promise<'429'|'api-call-error'|number> {
        return this.connection.getBlockHeight('confirmed').catch(r => {
            if (is429(r)) {
                logDebug('429 retrieving blockheight');
                return '429';
            }
            else {
                logError(r);
                return 'api-call-error';
            }
        });
    }

    private isSellConfirmable(positionID : string) : 'position-DNE'|'sell-already-confirmed'|'position-not-closing'|'no-sell-signature'|'no-sell-last-valid-blockheight'|'confirmable' {
        const checkPosition = this.openPositions.get(positionID);
        if (checkPosition == null) {
            return 'position-DNE';
        }
        if (checkPosition.sellConfirmed) {
            return 'sell-already-confirmed';
        }
        if (checkPosition.status !== PositionStatus.Closing) {
            return 'position-not-closing';
        }
        return 'confirmable';
    } 

    private async attemptConfirmation(positionID : string, blockheight : number) : Promise<
        ParsedSuccessfulSwapSummary|
        'position-DNE'|
        'sell-already-confirmed'|
        'position-not-closing'|
        'no-sell-signature'|
        'no-sell-last-valid-blockheight'|

        'tx-was-dropped'|
        'slippage-failed'|
        'other-failed'|
        'unconfirmed'|
        'frozen-token-account'|
        'token-fee-account-not-initialized'|
        'insufficient-sol'|
        'insufficient-tokens-balance'> {

        let confirmableStatus = this.isSellConfirmable(positionID);
        if (confirmableStatus !== 'confirmable') {
            return confirmableStatus;
        }

        const unconfirmedPosition = this.openPositions.get(positionID)!!;
        
        const parsedTx = await this.getParsedTransaction(unconfirmedPosition);

        // recheck because we awaited
        confirmableStatus = this.isSellConfirmable(positionID);
        if (confirmableStatus !== 'confirmable') {
            return confirmableStatus;
        }
        
        // if we couldn't find the TX
        if (parsedTx === 'tx-DNE') {
            // and the blockhash was finalized (as determined via blockheight)
            if (blockheight > unconfirmedPosition.sellLastValidBlockheight!!) {
                // the tx never happened.
                return 'tx-was-dropped';
            }
            else {
                // otherwise, who knows? we have to try again later.
                return 'unconfirmed';
            }
        }
        else if (parsedTx === 'api-error') {
            return 'unconfirmed';
        }
        else if (isSlippageSwapExecutionErrorParseSummary(parsedTx)) {
            return 'slippage-failed';
        }
        else if (isFrozenTokenAccountSwapExecutionErrorParseSummary(parsedTx)) {
            return 'frozen-token-account';
        }
        else if (isInsufficientNativeTokensSwapExecutionErrorParseSummary(parsedTx)) {
            return 'insufficient-sol';
        }
        else if (isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary(parsedTx)) {
            return 'token-fee-account-not-initialized';
        }
        else if (isOtherKindOfSwapExecutionError(parsedTx)) {
            return 'other-failed';
        }
        else if (isInsufficientTokensBalanceErrorParseSummary(parsedTx)) {
            return 'insufficient-tokens-balance';
        }
        else if (isSuccessfulSwapSummary(parsedTx)) {
            return parsedTx;
        }
        else {
            assertNever(parsedTx);
        }
    }    

    private async getParsedTransaction(position : Position) : Promise<'api-error'|'tx-DNE'|Exclude<ParsedSwapSummary,UnknownTransactionParseSummary>> {

        if (position.txSellSignature == null) {
            logError(`Attempted to confirm transaction with no sell signature set on position: ${position.positionID}`);
            return 'tx-DNE';
        }

        const parsedTransaction : 'api-error'|ParsedTransactionWithMeta|null = await this.connection.getParsedTransaction(position.txSellSignature!!, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        }).catch(e => {
            if (is429(e)) {
                return 'api-error';
            }
            else {
                logError(e);
                return 'api-error';
            }
        });

        if (parsedTransaction === 'api-error') {
            return 'api-error';
        }
        else if (parsedTransaction == null) {
            return 'tx-DNE';
        }
        else if ('meta' in parsedTransaction) {
            const params : ParseTransactionParams = {
                parsedTransaction,
                inTokenAddress : position.token.address,
                inTokenType : position.token.tokenType,
                outTokenAddress : position.vsToken.address,
                outTokenType : position.vsToken.tokenType,
                signature: position.txSellSignature!!,
                userAddress: position.userAddress
            }
            return parseParsedTransactionWithMeta(params, this.env);
        }
        else {
            assertNever(parsedTransaction);
        }
    }
    async handleUnexpectedFailure(positionID : string, r : any) {
        logError(r.toString())
        this.markAsNotConfirmingSell(positionID);
        await TGStatusMessage.finalMessage(this.channel, "We encountered an unexpected error while trying to confirm the sell.", true);
    }
}

function is429(e : any) {
    return (e?.message||'').includes('429');
}