import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { asTokenPrice } from "../../../decimalized/decimalized_amount";
import { Env } from "../../../env";
import { logDebug, logError } from "../../../logging";
import { Position, PositionStatus } from "../../../positions";
import { parseParsedTransactionWithMeta } from "../../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, ParsedSwapSummary, UnknownTransactionParseSummary, isFrozenTokenAccountSwapExecutionErrorParseSummary, isInsufficientNativeTokensSwapExecutionErrorParseSummary, isInsufficientTokensBalanceErrorParseSummary, isOtherKindOfSwapExecutionError, isSlippageSwapExecutionErrorParseSummary, isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary } from "../../../rpc/rpc_swap_parse_result_types";
import { TGStatusMessage } from "../../../telegram";
import { UpdateableMessage } from "../../../telegram/telegram_status_message";
import { assertNever, strictParseInt } from "../../../util";
import { SubsetOf } from "../../../util/builder_types";
import { assertIs } from "../../../util/enums";
import { ClosedPositionsTracker } from "../trackers/closed_positions_tracker";
import { DeactivatedPositionsTracker } from "../trackers/deactivated_positions_tracker";
import { OpenPositionsTracker } from "../trackers/open_positions_tracker";

type ConfirmationData = SubsetOf<Position>;

// Does the work of checking the blockchain to see if the buy succeeded.
// Can return 'unconfirmed' when answer is uncertain.
// Can return 'api-error' if API down... is a signal to back off the API calls.
export class UserDOBuyConfirmer {
    connection : Connection    
    startTimeMS : number
    env : Env
    openPositions : OpenPositionsTracker;
    closedPositions : ClosedPositionsTracker;
    deactivatedPositions : DeactivatedPositionsTracker;
    context: FetchEvent
    constructor(connection : Connection, startTimeMS : number, env : Env,
        openPositions : OpenPositionsTracker,
        closedPositions : ClosedPositionsTracker,
        deactivatedPositions : DeactivatedPositionsTracker,
        context: FetchEvent
    ) {
        this.connection = connection;
        this.startTimeMS = startTimeMS;
        this.env = env;
        this.openPositions = openPositions;
        this.closedPositions = closedPositions;
        this.deactivatedPositions = deactivatedPositions;
        this.context = context;
    }
    isTimedOut() : boolean {
        return (Date.now() > this.startTimeMS + strictParseInt(this.env.CONFIRM_TIMEOUT_MS));
    }
    async maybeConfirmBuy(positionID : string) : Promise<'do-not-continue'|'continue'> {

        // early out if no more time on request
        if (this.isTimedOut()) {
            return 'do-not-continue';
        }

        // early out if API is down / rate-limited
        const blockheight : number | 'api-call-error' | '429' = await this.getBlockheight();
        if (blockheight === '429') {
            return 'do-not-continue';
        }
        else if (blockheight === 'api-call-error') {
            return 'do-not-continue';
        }

        // early out if position is not in confirmable status anymore
        const positionStatus = this.ensurePositionIsConfirmable(positionID);
        if (positionStatus === 'position-DNE') {
            return 'continue';
        }
        else if (positionStatus == 'position-already-confirmed') {
            return 'continue';
        }
        else if (positionStatus === 'position-not-open') {
            return 'continue';
        }

        // confirm the position and keep the user informated with updates
        assertIs<'position-confirmable', typeof positionStatus>();
        const channel = this.makeConfirmBuyTelegramNotificationChannel(positionID);
        const result = await this.attemptConfirmation(positionID, blockheight);
        await this.performActionForBuyConfirmationResult(positionID, result, channel);
        return 'continue'
    }
    
    private async getBlockheight() : Promise<'429'|'api-call-error'|number> {
        return await this.connection.getBlockHeight('confirmed').catch(r => {
            logError(r);
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

    makeConfirmBuyTelegramNotificationChannel(positionID: string) {
        const unconfirmedPosition = this.openPositions.get(positionID)!!;
        const buyConfirmPrefix = `:notify: <b>Attempting to confirm your earlier purchase of ${asTokenPrice(unconfirmedPosition.tokenAmt)} ${unconfirmedPosition.token.symbol}</b>: `;
        const channel = TGStatusMessage.createAndSend('In progress...', false, unconfirmedPosition.chatID, this.env, 'HTML', buyConfirmPrefix);   
        return channel;
    }

    ensurePositionIsConfirmable(positionID : string) : 'position-DNE'|'position-already-confirmed'|'position-not-open'|'position-confirmable' {
        const position = this.openPositions.get(positionID);
        if (position == null) {
            return 'position-DNE';
        }
        else if (position.buyConfirmed) {
            return 'position-already-confirmed';
        }
        else if (position.status == PositionStatus.Closing || position.status == PositionStatus.Closed) {
            return 'position-not-open';
        }
        else {
            return 'position-confirmable';
        }
    }

    private async performActionForBuyConfirmationResult(positionID : string,
        status :
        ConfirmationData|
        'position-DNE'|
        'position-already-confirmed'|
        'position-not-open'|
        'failed'|
        'unconfirmed'|
        'slippage-failed'|
        'frozen-token-account'|
        'token-fee-account-not-initialized'|
        'insufficient-sol'|
        'insufficient-tokens-balance', 
        channel : UpdateableMessage) {

        // recheck before we have entered an async function
        const recheck = this.isPositionStillConfirmable(positionID);
        if (recheck !== 'confirmable') {
            status = recheck;
        }

        if (status === 'position-DNE') {
            TGStatusMessage.queue(channel, "On checking, it looks like the purchase or position no longer exists or was deactivated.", true);
        }
        else if (status === 'position-already-confirmed') {
            TGStatusMessage.queue(channel, "On checking, it looks like this purchase has been confirmed!", true);
        }
        else if (status === 'position-not-open') {
            TGStatusMessage.queue(channel, "On checking, it looks like this purchase is currently being sold or has been sold!", true);
        }
        else if (status === 'unconfirmed') {
            TGStatusMessage.queue(channel, "We had a hard time confirming the purchase because of network congestion or the transaction happened too recently - sorry, we will retry confirmation again soon.", true);
        }
        else if (status === 'failed') {
            TGStatusMessage.queue(channel, "After checking, we found that the purchase didn't go through.", true);
            this.removePosition(positionID);
        }
        else if (status === 'frozen-token-account') {
            const pos = this.openPositions.get(positionID)!!;
            TGStatusMessage.queue(channel, `After checking, we found that the purchase didn't go through because $${pos.token.symbol} has been frozen due to suspicious activity.`, true);
            this.removePosition(positionID);
        }
        else if (status === 'insufficient-sol') {
            TGStatusMessage.queue(channel, `After checking, we found that the purchase didn't go through because there wasn't enough SOL in your account to cover the purchase`, true);
            this.removePosition(positionID);
        }
        else if (status === 'slippage-failed') {
            TGStatusMessage.queue(channel, `After checking, we found that the purchase didn't go through because the slippage tolerance was exceeded`, true);
            this.removePosition(positionID);
        }
        else if (status === 'token-fee-account-not-initialized') {
            TGStatusMessage.queue(channel, `After checking, we found that the purchase didn't complete.`, true);
            this.removePosition(positionID);
        }
        else if (status === 'insufficient-tokens-balance') {
            // This shouldn't happen because we can't have too few of the tokens we are currently buying
            // But I include this case to make TS happy
            TGStatusMessage.queue(channel, `After checking, we found that there were not enough tokens to cover the purchase.`, true);
            this.removePosition(positionID);
        }
        else {
            assertIs<ConfirmationData, typeof status>();
            TGStatusMessage.queue(channel, "We were able to confirm this purchase! It will be listed in your open positions.", true);
            this.openPositions.mutatePosition(positionID, p => {
                Object.assign(p, status);
            });
        }
        await TGStatusMessage.finalize(channel);
    }
    removePosition(positionID: string) {
        this.openPositions.deletePosition(positionID);
    }

    private isPositionStillConfirmable(positionID : string) : 'position-DNE'|'position-already-confirmed'|'position-not-open'|'confirmable' {
        const recheckPosition = this.openPositions.get(positionID);
        if (recheckPosition == null) {
            return 'position-DNE'; // TODO: better status here, like position-DNE
        }
        // position is already confirmed - no work to be done!
        if (recheckPosition.buyConfirmed === true) {
            return 'position-already-confirmed';
        }
        // position no longer open - no work to be done!
        if (recheckPosition.status !== PositionStatus.Open) {
            return 'position-not-open';
        }

        return 'confirmable';
    }

    private async attemptConfirmation(positionID : string, blockheight : number) : Promise<
        ConfirmationData|
        'position-DNE'|
        'position-already-confirmed'|
        'position-not-open'|
        'failed'|
        'unconfirmed'|
        'slippage-failed'|
        'frozen-token-account'|
        'token-fee-account-not-initialized'|
        'insufficient-sol'|
        'insufficient-tokens-balance'> {

        // recheck the position status since we are in an async function
        let checkPosStatus = this.isPositionStillConfirmable(positionID);
        if (checkPosStatus != 'confirmable') {
            return checkPosStatus;
        }

        // now we can name it properly
        const unconfirmedPosition = this.openPositions.get(positionID)!!;

        // get the tx status from the RPC
        const parsedTx = await this.getParsedTransaction(unconfirmedPosition);

        // re-check again because we awaited again
        checkPosStatus = this.isPositionStillConfirmable(positionID);
        if (checkPosStatus != 'confirmable') {
            return checkPosStatus;
        }
        
        // if the TX DNE, the status depends on the current blockheight
        if (parsedTx === 'tx-DNE') {
            if (blockheight > unconfirmedPosition.buyLastValidBlockheight) {
                return 'failed';
            }
            else {
                return 'unconfirmed';
            }
        }
        else if (parsedTx === 'api-error') {
            return 'unconfirmed';
        }
        else if (isSlippageSwapExecutionErrorParseSummary(parsedTx)) {
            return 'slippage-failed';
        }
        else if (isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary(parsedTx)) {
            return 'token-fee-account-not-initialized';
        }
        else if (isFrozenTokenAccountSwapExecutionErrorParseSummary(parsedTx)) {
            return 'frozen-token-account';
        }
        else if (isInsufficientNativeTokensSwapExecutionErrorParseSummary(parsedTx)) {
            return 'insufficient-sol';
        }
        else if (isOtherKindOfSwapExecutionError(parsedTx)) {
            return 'failed';
        }
        else if (isInsufficientTokensBalanceErrorParseSummary(parsedTx)) {
            return 'insufficient-tokens-balance';
        }
        
        const confirmationData = this.getConfirmationData(parsedTx);
        return confirmationData;   
    }

    private getConfirmationData(parsedSuccessfulSwap : ParsedSuccessfulSwapSummary) {
        const confirmationData = {
            status: PositionStatus.Open,
            buyConfirmed: true,
            sellConfirmed: false,
            txSellSignature: null,
            sellLastValidBlockheight: null,
            currentPrice: parsedSuccessfulSwap.swapSummary.fillPrice,
            currentPriceMS: parsedSuccessfulSwap.swapSummary.swapTimeMS,
            peakPrice: parsedSuccessfulSwap.swapSummary.fillPrice, // TODO: think about this
            tokenAmt: parsedSuccessfulSwap.swapSummary.outTokenAmt,        
            fillPrice: parsedSuccessfulSwap.swapSummary.fillPrice,
            fillPriceMS : parsedSuccessfulSwap.swapSummary.swapTimeMS,
            txSellAttemptTimeMS: null,
            netPNL: null, // to be set on sell
            otherSellFailureCount: 0
        };
        return confirmationData;
    }

    private async getParsedTransaction(position : Position) : Promise<'api-error'|'tx-DNE'|Exclude<ParsedSwapSummary,UnknownTransactionParseSummary>> {
        const parsedTransaction : 'api-error'|ParsedTransactionWithMeta|null = await this.connection.getParsedTransaction(position.txBuySignature, {
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
            const inTokenAddress = position.vsToken.address;
            const outTokenAddress = position.token.address;
            return parseParsedTransactionWithMeta(parsedTransaction, inTokenAddress, outTokenAddress, position.txBuySignature, position.userAddress, this.env);
        }
        else {
            assertNever(parsedTransaction);
        }
    }
}

function is429(e : any) {
    return (e?.message||'').includes('429');
}