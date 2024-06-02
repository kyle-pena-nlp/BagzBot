import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { dSub } from "../../../decimalized";
import { DecimalizedAmount, asTokenPrice, asTokenPriceDelta } from "../../../decimalized/decimalized_amount";
import { Env } from "../../../env";
import { logDebug, logError } from "../../../logging";
import { MenuCode } from "../../../menus";
import { Position, PositionStatus } from "../../../positions";
import { parseParsedTransactionWithMeta } from "../../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, ParsedSwapSummary, UnknownTransactionParseSummary, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isInsufficientTokensBalanceErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary } from "../../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage } from "../../../telegram";
import { UpdateableMessage } from "../../../telegram/telegram_status_message";
import { assertNever, strictParseBoolean, strictParseInt } from "../../../util";
import { SubsetOf } from "../../../util/builder_types";
import { ClosedPositionsTracker } from "../trackers/closed_positions_tracker";
import { DeactivatedPositionsTracker } from "../trackers/deactivated_positions_tracker";
import { OpenPositionsTracker } from "../trackers/open_positions_tracker";

type ConfirmationData = SubsetOf<Position>;

export class UserDOSellConfirmer {
    connection : Connection
    startTimeMS : number
    env : Env
    openPositions : OpenPositionsTracker;
    closedPositions : ClosedPositionsTracker;
    deactivatedPositions : DeactivatedPositionsTracker;
    constructor(connection : Connection, startTimeMS : number, env : Env,
        openPositions : OpenPositionsTracker,
        closedPositions : ClosedPositionsTracker,
        deactivatedPositions : DeactivatedPositionsTracker
    ) {
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
    async maybeConfirmSell(positionID : string) : Promise<'do-not-continue'|'continue'> {

        // if timed out, early-out
        if (this.isTimedOut()) {
            return 'do-not-continue';
        }

        // try to get the blockheight, early-out if you can't (RPC api is down or 429'ed)
        const blockheight : number | 'api-call-error' | '429' = await this.getBlockheight();
        if (blockheight === '429') {
            return 'do-not-continue';
        }
        else if (blockheight === 'api-call-error') {
            return 'do-not-continue';
        }        

        // recheck status of position because we are in any async method
        let confirmableStatus = this.isSellConfirmable(positionID);
        if (confirmableStatus !== 'confirmable') {
            return 'continue';
        }
        else if (typeof blockheight === 'number') {
            const channel = this.makeTelegramSellConfirmationChannel(positionID);
            const confirmationData = await this.attemptConfirmation(positionID, blockheight);
            await this.performSellConfirmationAction(positionID, confirmationData, channel);
            return 'continue';
        }
        else {
            assertNever(blockheight);
        }
    }
    makeTelegramSellConfirmationChannel(positionID : string) {
        const pos = this.openPositions.get(positionID)!!;
        const sellConfirmPrefix = `:notify: <b>Attempting to confirm the earlier sale of ${asTokenPrice(pos.tokenAmt)} $${pos.token.symbol}</b>: `;
        const channel = TGStatusMessage.createAndSend('In progress...', false, pos.chatID, this.env, 'HTML', sellConfirmPrefix);
        return channel;
    }
    async performSellConfirmationAction(positionID : string, status: ParsedSuccessfulSwapSummary|
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
        'insufficient-tokens-balance', channel: UpdateableMessage) {

        // since we are entering an async we need to recheck it's confirmable
        const recheck = this.isSellConfirmable(positionID);
        if (recheck !== 'confirmable') {
            status = recheck;
        }

        if (status === 'unconfirmed') {
            await TGStatusMessage.finalMessage(channel, "Confirmation not complete - we will continue soon.", true);
            // no action on position in tracker because could not confirm outcome
        }
        else if (status === 'tx-was-dropped') {
            await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through.", true);
            this.markPositionAsOpen(positionID);                
        }
        else if (status === 'other-failed') {
            const max_other_sell_failures = strictParseInt(this.env.OTHER_SELL_FAILURES_TO_DEACTIVATE);
            const otherSellFailureCount = this.openPositions.getProperty(positionID, p => p.otherSellFailureCount)||0;
            if (otherSellFailureCount+1 >= max_other_sell_failures) {
                this.markPositionAsOpen(positionID);
                this.deactivatePosition(positionID);
                await TGStatusMessage.finalMessage(channel, `Sale of this position failed for an unknown reason ${max_other_sell_failures} or more times, so this position will be deactivated.`, MenuCode.ViewDeactivatedPositions);                        
            }
            else {
                this.openPositions.mutatePosition(positionID, p => {
                    p.otherSellFailureCount = otherSellFailureCount+1
                });
                this.markPositionAsOpen(positionID);
                await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through.", true);
            }
        }
        else if (status === 'slippage-failed') {
            const { sellAutoDoubleSlippage, sellSlippagePercent } = this.openPositions.getProperty(positionID, p => { p.sellAutoDoubleSlippage, p.sellSlippagePercent } )!!;
            if (sellAutoDoubleSlippage && strictParseBoolean(this.env.ALLOW_CHOOSE_AUTO_DOUBLE_SLIPPAGE)) {
                const maxSlippage = 100;
                const updatedSellSlippagePercent = Math.min(maxSlippage, 2 * sellSlippagePercent);
                await TGStatusMessage.finalMessage(channel, `The sale failed due to slippage.  We have increased the slippage to ${updatedSellSlippagePercent}% and will retry the sale if the trigger conditions holds.`, true);
                //this.updateSlippage(pos.positionID,sellSlippagePercent);
                this.openPositions.mutatePosition(positionID, p => {
                    p.sellSlippagePercent = updatedSellSlippagePercent;
                })
                this.markPositionAsOpen(positionID);
            }
            else {
                const triggerPercent = this.openPositions.getProperty(positionID, p => p.triggerPercent)!!;
                await TGStatusMessage.finalMessage(channel, `The sale failed due to slippage. We will re-sell if the price continues to stay ${triggerPercent.toFixed(1)}% below the peak.`, true);
                this.markPositionAsOpen(positionID);
            }
        }
        else if (status === 'frozen-token-account') {
            await TGStatusMessage.finalMessage(channel, "The sale didn't go through because this token has been frozen (most likely it was rugged).  The position has been deactivated.", true);
            this.markPositionAsOpen(positionID);
            this.deactivatePosition(positionID);
        }
        else if (status === 'insufficient-sol') {
            await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through because there wasn't enough SOL in your wallet to cover transaction fees. The position has been deactivated.", true);
            this.markPositionAsOpen(positionID);
            this.deactivatePosition(positionID);
        }
        else if (status === 'token-fee-account-not-initialized') {
            this.markPositionAsOpen(positionID);
            this.deactivatePosition(positionID);
            await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through because of an error on our platform. The position has been deactivated.", true);
        }
        else if (status === 'insufficient-tokens-balance') {
            this.markPositionAsOpen(positionID);
            this.deactivatePosition(positionID);
            await TGStatusMessage.finalMessage(channel, "We found that the sale didn't go through because there were not enough tokens in your wallet to cover the sale. The position has been deactivated.", true);
        }
        else if (status === 'position-DNE') {
            await TGStatusMessage.finalMessage(channel, "We found that the position no longer exists, or has been deactivated or closed.", true);
        }
        else if (status === 'no-sell-last-valid-blockheight') {
            await TGStatusMessage.finalMessage(channel, "We could not confirm the sale.", true);
        }
        else if (status === 'no-sell-signature') {
            await TGStatusMessage.finalMessage(channel, "We could not confirm the sale.", true);
        }
        else if (status === 'position-not-closing') {
            await TGStatusMessage.finalMessage(channel, "We found that the position is no longer being sold.", true);
        }
        else if (status === 'sell-already-confirmed') {
            await TGStatusMessage.finalMessage(channel, "The sale has been confirmed!", true);
        }
        else if (isSuccessfullyParsedSwapSummary(status)) {
            // TODO: update with PnL    
            const pos = this.openPositions.get(positionID)!!;           
            const netPNL = dSub(status.swapSummary.outTokenAmt, pos.vsTokenAmt);
            this.closePosition(positionID, netPNL);
            await TGStatusMessage.finalMessage(channel, `The sale was confirmed! You made ${asTokenPriceDelta(netPNL)} SOL.`, MenuCode.ViewPNLHistory); 
        }
        else {
            assertNever(status);
        }
    }
    closePosition(positionID: string, netPNL: DecimalizedAmount) {
        const position = this.openPositions.markAsClosedAndReturn(positionID);
        if (position != null) {
            position.netPNL = netPNL;
            this.closedPositions.upsert(position as (Position & { netPNL : DecimalizedAmount })); // not sure why TS couldn't figure this out
        }
    }
    deactivatePosition(positionID: string) {
        const position = this.openPositions.deactivateAndReturn(positionID);
        if (position != null) {
            this.deactivatedPositions.upsert(position);
        }
    }
    markPositionAsOpen(positionID: string) {
        this.openPositions.markAsOpenAndReturn(positionID);
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
        if (checkPosition.txSellSignature == null) {
            return 'no-sell-signature';
        }
        if (checkPosition.sellLastValidBlockheight) {
            return 'no-sell-last-valid-blockheight';
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
            const inTokenAddress = position.token.address;
            const outTokenAddress = position.vsToken.address;
            return parseParsedTransactionWithMeta(parsedTransaction, inTokenAddress, outTokenAddress, position.txSellSignature!!, position.userAddress, this.env);
        }
        else {
            assertNever(parsedTransaction);
        }
    }    
}

function is429(e : any) {
    return (e?.message||'').includes('429');
}