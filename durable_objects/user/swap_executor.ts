import { Connection, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { UserAddress, Wallet, toUserAddress } from "../../crypto";
import { Env } from "../../env";
import { logDebug, logError, logInfo } from "../../logging";
import { Swappable, getSwapOfXDescription, isPosition, isPositionRequest } from "../../positions";
import { executeAndConfirmSignedTx } from "../../rpc/rpc_execute_signed_transaction";
import { parseBuySwapTransaction, parseSellSwapTransaction } from "../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, ParsedSwapSummary, PreparseConfirmedSwapResult, SwapExecutionError, TransactionExecutionError, TransactionExecutionErrorCouldntConfirm, UnknownTransactionParseSummary, isConfirmed as isConfirmedTxExecution, isFailedSwapSlippageTxExecution, isFailedSwapTxExecution, isFailedTxExecution, isSuccessfullyParsedSwapSummary, isSwapExecutionErrorParseSwapSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";

export type TransactionExecutionResult = 'tx-failed'|
    SwapFailedTxResultAndInfo|
    SwapFailedSlippageTxResultAndInfo|
    CouldNotConfirmTxResultAndInfo|
    SuccessfulTxResultAndInfo;

export interface CouldNotConfirmTxResultAndInfo {
    result:  'could-not-confirm'
    signature : string
    lastValidBH : number
}

export function isCouldNotConfirmTxResultAndInfo(x : TransactionExecutionResult) : x is CouldNotConfirmTxResultAndInfo {
    return typeof x !== 'string' && x.result === 'could-not-confirm';
}

export interface SwapFailedTxResultAndInfo {
    result:  'swap-failed'
    signature : string
    lastValidBH : number
}

export function isSwapFailedTxResultAndInfo(x : TransactionExecutionResult) : x is SwapFailedTxResultAndInfo {
    return typeof x !== 'string' && x.result === 'swap-failed';
}

export interface SwapFailedSlippageTxResultAndInfo {
    result:  'swap-failed-slippage'
    signature : string
    lastValidBH : number  
}

export function isSwapFailedSlippageTxResultAndInfo(x : TransactionExecutionResult) : x is SwapFailedSlippageTxResultAndInfo {
    return typeof x !== 'string' && x.result === 'swap-failed-slippage';
}

export interface SuccessfulTxResultAndInfo { 
    result : ParsedSuccessfulSwapSummary, 
    signature: string, 
    lastValidBH : number
}

export function isSuccessfulTxExecutionResult(x : TransactionExecutionResult) : x is SuccessfulTxResultAndInfo {
    return typeof x !== 'string' && 
        typeof x.result !== 'string' && 
        isSuccessfullyParsedSwapSummary(x.result);
}

export class SwapExecutor {
    wallet : Wallet
    env : Env
    notificationChannel: UpdateableNotification
    connection : Connection
    lastValidBH : number
    startTimeMS : number
    constructor(wallet : Wallet, 
        env : Env, 
        notificationChannel : UpdateableNotification, 
        connection : Connection,
        lastValidBH : number,
        startTimeMS : number) {
        this.wallet = wallet;
        this.env = env;
        this.notificationChannel = notificationChannel;
        this.connection = connection;
        this.lastValidBH = lastValidBH
        this.startTimeMS = startTimeMS;
    }

    async executeAndConfirmSignedTx(s : Swappable, signedTx : VersionedTransaction) : Promise<TransactionExecutionResult> {
          
        // get a friendly description of what we are doing
        const SwapOfX = getSwapOfXDescription(s, true);
        const swapOfX = getSwapOfXDescription(s);

        // get some stuff we'll need
        const signature = bs58.encode(signedTx.signatures[0]);
        const userAddress = toUserAddress(this.wallet);
        
        // attempt to execute and confirm tx
        TGStatusMessage.queue(this.notificationChannel, `Executing transaction... (this could take a moment)`, false);
        let maybeExecutedTx = await executeAndConfirmSignedTx(s.positionID, signedTx, this.lastValidBH, this.connection, this.env, this.startTimeMS);


        if (isFailedSwapSlippageTxExecution(maybeExecutedTx)) {
            logInfo("Swap failed due to slippage", s, maybeExecutedTx);
            const msg = makeSwapSummaryFailedMessage(maybeExecutedTx.status, s);
            TGStatusMessage.queue(this.notificationChannel, msg, false);
            return { result: 'swap-failed-slippage', signature : signature, lastValidBH: lastValidBH };
        }

        // transaction didn't go through
        if (isFailedTxExecution(maybeExecutedTx)) {
            logError('Transaction execution failed', s, maybeExecutedTx);
            const msg = makeTransactionFailedErrorMessage(s, maybeExecutedTx.status);
            TGStatusMessage.queue(this.notificationChannel, msg, false);
            return 'tx-failed';        
        }


        // transaction went through, but swap failed for some other reason. early out.
        if (isFailedSwapTxExecution(maybeExecutedTx)) {
            logError('Swap failed', s, maybeExecutedTx);
            const msg = makeSwapSummaryFailedMessage(maybeExecutedTx.status, s);
            TGStatusMessage.queue(this.notificationChannel, msg, false);
            return { result: 'swap-failed', signature : signature, lastValidBH: lastValidBH };
        }

        let parsedSwapSummary : ParsedSwapSummary|null = null;

        // if tx went through, attempt parse.
        if (isConfirmedTxExecution(maybeExecutedTx)) {
            logDebug('Transaction confirmed - preparing to parse', s, maybeExecutedTx);
            parsedSwapSummary = await parseSwapTransaction(s, maybeExecutedTx, userAddress, this.connection, this.env).catch(r => {
                logError("Error retrieving transaction", r)
                return null;
            });
        }
        
        // if the act of retrieving the parsed transaction failed... early out.
        if (parsedSwapSummary == null) {
            logInfo('Could not retrieve transaction', s, { signature : signature });
            const msg = `Your ${swapOfX} could not be confirmed, but we will retry soon!`;
            TGStatusMessage.queue(this.notificationChannel, msg, false);
            return { result: 'could-not-confirm', signature: signature, lastValidBH: lastValidBH };
        }

        // if parsing the confirmed tx shows there was a problem with the swap, early out.
        if (isSwapExecutionErrorParseSwapSummary(parsedSwapSummary)) {
            logError('Swap execution error', s, parsedSwapSummary);
            const failedMsg = makeSwapSummaryFailedMessage(parsedSwapSummary.status, s);
            TGStatusMessage.queue(this.notificationChannel, failedMsg, false);
            return { result: 'swap-failed', signature : signature, lastValidBH: lastValidBH };
        }

        // if everything went ok
        if (isSuccessfullyParsedSwapSummary(parsedSwapSummary)) {
            logInfo('Swap successful', s, parsedSwapSummary);
            const msg = `${SwapOfX} was successful.`;
            TGStatusMessage.queue(this.notificationChannel, msg, true);
        }

        // if we couldn't confirm.
        if (isUnknownTransactionParseSummary(parsedSwapSummary)) {
            logInfo('Tx did not exist', s, parsedSwapSummary);
            const msg = `Could not confirm ${SwapOfX}.`;
            TGStatusMessage.queue(this.notificationChannel, msg, false);
            return { result: 'could-not-confirm', signature: signature, lastValidBH : lastValidBH };
        }

        return { result: parsedSwapSummary, signature: signature, lastValidBH: lastValidBH };
    }
}

function makeTxNotFoundMessage(unknownTxParseSwapSummary : UnknownTransactionParseSummary, s : Swappable) : string {
    const purchaseOfX = getSwapOfXDescription(s, true);
    return `${purchaseOfX} failed.`;
}

function makeSwapSummaryFailedMessage(status : SwapExecutionError, s: Swappable) : string {
    const swapOfX = getSwapOfXDescription(s, true);
    switch(status) {
        case SwapExecutionError.InsufficientSOLBalance:
            return `${swapOfX} was not executed due to insufficient SOL.`;
        case SwapExecutionError.InsufficientTokenBalance:
            return `${swapOfX} was not executed due to insufficient balance.`;
        case SwapExecutionError.SlippageToleranceExceeded:
            return `${swapOfX} was not executed.  The slippage tolerance was exceeded (price moved too fast).`;
        case SwapExecutionError.OtherSwapExecutionError:
            return `${swapOfX} failed.`;
        case SwapExecutionError.TokenAccountFeeNotInitialized:
            return `${swapOfX} failed.`;
        default:
            assertNever(status);
    }
}

function parseSwapTransaction(s : Swappable, confirmedTx : PreparseConfirmedSwapResult, userAddress : UserAddress, connection : Connection, env : Env) : Promise<ParsedSwapSummary> {
    if (isPositionRequest(s)) {
        return parseBuySwapTransaction(s, confirmedTx, userAddress, connection, env);
    }
    else if (isPosition(s)) {
        return parseSellSwapTransaction(s, confirmedTx, userAddress, connection, env);
    }
    else {
        throw new Error("Programmer error.");
    }
}

function makeTransactionFailedErrorMessage(s: Swappable, status : TransactionExecutionError) {
    const swapOfX = getSwapOfXDescription(s, true);
    switch(status) {
        case TransactionExecutionError.BlockheightExceeded:
            return `${swapOfX} could not be completed due to network traffic.`;
        case TransactionExecutionError.CouldNotPollBlockheightNoTxSent:
            return `${swapOfX} failed due to error with 3rd party.`;
        case TransactionExecutionError.InsufficientFundsError:
            return `${swapOfX} failed due to insufficient funds.`;
        case TransactionExecutionError.InsufficientNativeTokensError:
            return `${swapOfX} failed because there was not enough SOL in your wallet to cover transaction fees.`;
        case TransactionExecutionError.SlippageToleranceExceeded:
            return `${swapOfX} failed because slippage tolerance was exceeded (the price moved too fast).`;
        case TransactionExecutionError.TransactionDropped:
            return `${swapOfX} failed because the order was dropped by a 3rd party.`;
        case TransactionExecutionError.TransactionFailedOtherReason:
            return `${swapOfX} failed.`;
        case TransactionExecutionError.CouldNotDetermineMaxBlockheight:
            return `${swapOfX} failed because a 3rd party service is down.`;
        case TransactionExecutionError.TokenFeeAccountNotInitialized:
            return `${swapOfX} failed because of a configuration problemwith the bot.`;
        default:
            assertNever(status);
    }
}

function makeTransactionUnconfirmedMessage(s: Swappable, status: TransactionExecutionErrorCouldntConfirm | undefined | null) {
    const swapOfX = getSwapOfXDescription(s);
    const swapOfXCaps = getSwapOfXDescription(s, true);
    const weWillRetry = `We will retry confirming your ${swapOfX}`;
    if (status == null) {
        return `${swapOfXCaps} could not be confirmed.  ${weWillRetry}.`;
    }
    switch(status) {
        case TransactionExecutionErrorCouldntConfirm.CouldNotConfirmTooManyExceptions:
            return `${swapOfXCaps} could not be confirmed.  ${weWillRetry}.`;
        case TransactionExecutionErrorCouldntConfirm.TimeoutCouldNotConfirm:
            return `${swapOfXCaps} could not be confirmed within time limit. ${weWillRetry}.`;
        case TransactionExecutionErrorCouldntConfirm.UnknownCouldNotConfirm:
            return `Something went wrong and ${swapOfX} could not be confirmed.  ${weWillRetry}.`;
        default:
            assertNever(status);
    }
}