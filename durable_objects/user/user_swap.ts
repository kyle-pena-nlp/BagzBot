import { Connection, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { UserAddress, Wallet, toUserAddress } from "../../crypto";
import { Env } from "../../env";
import { logDebug, logError, logInfo } from "../../logging";
import { Swappable, getSwapOfXDescription, isPosition, isPositionRequest } from "../../positions";
import { getBuyTokenSwapRoute, getSellTokenSwapRoute } from "../../rpc/jupiter_quotes";
import { serializeSwapRouteTransaction } from "../../rpc/jupiter_serialize";
import { SwapRoute } from "../../rpc/jupiter_types";
import { executeAndMaybeConfirmTx } from "../../rpc/rpc_execute_signed_transaction";
import { parseBuySwapTransaction, parseSellSwapTransaction } from "../../rpc/rpc_parse";
import { signTransaction } from "../../rpc/rpc_sign_tx";
import { GetQuoteFailure, ParsedSuccessfulSwapSummary, ParsedSwapSummary, PreparseConfirmedSwapResult, PreparseSwapResult, SwapExecutionError, TransactionExecutionError, TransactionExecutionErrorCouldntConfirm, UnknownTransactionParseSummary, isConfirmed as isConfirmedTxExecution, isFailedSwapTxExecution, isFailedTxExecution, isGetQuoteFailure, isSuccessfullyParsedSwapSummary, isSwapExecutionErrorParseSwapSummary, isTransactionPreparationFailure, isUnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
/* markPositionAsOpen, renegeOpenPosition */


export async function createAndSignTx(s : Swappable, 
    wallet: Wallet,
    env: Env,
    notificationChannel : UpdateableNotification) : Promise<VersionedTransaction|undefined> {

    // last minute check to make sure we aren't swapping forbidden tokens

    const forbidden_tokens = env.FORBIDDEN_TOKENS.split(",");

    if (forbidden_tokens.includes(s.token.address)) {
        throw new Error(`Cannot swap vsToken ${s.token.address}`);
    }

    if (forbidden_tokens.includes(s.vsToken.address)) {
        throw new Error(`Cannot swap vsToken ${s.vsToken.address}`);
    }

    // get friendly description of what we are doing
    const swapOfX = getSwapOfXDescription(s);

    // get a swap route. if fails, early out.
    const swapRoute = await getSwapRoute(s, env).catch(r => null);
    if (swapRoute == null || isGetQuoteFailure(swapRoute)) {
        logError("Failed getting swap route", s, swapRoute);
        TGStatusMessage.queue(notificationChannel, `Could not get a quote for ${swapOfX} - purchase failed. Try again soon.`, false);
        return;
    }
    else{
        TGStatusMessage.queue(notificationChannel, `Quote found for ${swapOfX}`, false);
    }

    // serialize swap route. if fails, early out.
    const txBuffer = await serializeSwapRouteTransaction(swapRoute, wallet.publicKey, shouldIncludeReferralPlatformFee(s), env).catch(r => null);
    if (txBuffer == null || isTransactionPreparationFailure(txBuffer)) {
        logError("Failed serializing transaction", s, txBuffer);
        TGStatusMessage.queue(notificationChannel, `Could not prepare transaction - ${swapOfX} failed.`, false);
        return;
    }
    else {
        TGStatusMessage.queue(notificationChannel, `Transaction serialized for ${swapOfX}`, false);
    }

    // sign tx. if fails, early out.
    const signedTx = await signTransaction(txBuffer, wallet, s.userID, env).catch(r => null);
    if (signedTx == null || isTransactionPreparationFailure(signedTx)) {
        logError("Failed signing transaction", s, signedTx);
        TGStatusMessage.queue(notificationChannel, `Could not sign transaction - ${swapOfX} failed.`, false);
        return;
    }
    else {
        TGStatusMessage.queue(notificationChannel, `Transaction for ${swapOfX} signed.`, false);
    }

    return signedTx;
}

/* 
    This method should not throw any exceptions and should be absolutely bullet proof to exceptional circumstances
*/
export async function executeAndConfirmSignedTx(s: Swappable, 
    signedTx : VersionedTransaction,
    wallet : Wallet, 
    env : Env,
    notificationChannel : UpdateableNotification,
    connection : Connection) : Promise<ParsedSuccessfulSwapSummary|
    'could-not-retrieve-tx'|
    'tx-failed'|
    'swap-failed'> {
    
    // get a friendly description of what we are doing
    const SwapOfX = getSwapOfXDescription(s, true);

    // get some stuff we'll need
    const signature = bs58.encode(signedTx.signatures[0]);
    const userAddress = toUserAddress(wallet);

    // attempt to execute and confirm tx
    TGStatusMessage.queue(notificationChannel, `Executing transaction... (this could take a moment)`, false);
    let maybeExecutedTx = await executeAndMaybeConfirmTx(s.positionID, signedTx, connection, env);

    // transaction didn't go through
    if (isFailedTxExecution(maybeExecutedTx)) {
        logError('Transaction execution failed', s, maybeExecutedTx);
        const msg = makeTransactionFailedErrorMessage(s, maybeExecutedTx.status);
        TGStatusMessage.queue(notificationChannel, msg, false);
        return 'tx-failed';        
    }

    // transaction went through, but swap failed. early out.
    if (isFailedSwapTxExecution(maybeExecutedTx)) {
        logError('Swap failed', s, maybeExecutedTx);
        const msg = makeSwapSummaryFailedMessage(maybeExecutedTx.status, s);
        TGStatusMessage.queue(notificationChannel, msg, false);
        return 'swap-failed';
    }    

    let parsedSwapSummary : ParsedSwapSummary|null = null;

    // if tx went through, attempt parse.
    if (isConfirmedTxExecution(maybeExecutedTx)) {
        logDebug('Transaction confirmed - preparing to parse', s, maybeExecutedTx);
        parsedSwapSummary = await parseSwapTransaction(s, maybeExecutedTx, userAddress, connection, env).catch(r => {
            logError("Error retrieving transaction", r)
            return null;
        });
    }
    
    // if the act of retrieving the parsed transaction failed... early out.
    if (parsedSwapSummary == null) {
        logError('Unexpected error retrieving transaction', s, { signature : signature });
        const msg = `There was a problem retrieving information about your transaction.`;
        TGStatusMessage.queue(notificationChannel, msg, false);
        return 'could-not-retrieve-tx';
    }

    // if parsing the confirmed tx shows there was a problem with the swap, early out.
    if (isSwapExecutionErrorParseSwapSummary(parsedSwapSummary)) {
        logError('Swap execution error', s, parsedSwapSummary);
        const failedMsg = makeSwapSummaryFailedMessage(parsedSwapSummary.status, s);
        TGStatusMessage.queue(notificationChannel, failedMsg, false);
        return 'swap-failed';
    }

    // if everything went ok
    if (isSuccessfullyParsedSwapSummary(parsedSwapSummary)) {
        logInfo('Swap successful', s, parsedSwapSummary);
        const msg = `${SwapOfX} was successful.`;
        TGStatusMessage.queue(notificationChannel, msg, true);
    }

    // if we couldn't confirm.
    if (isUnknownTransactionParseSummary(parsedSwapSummary)) {
        logInfo('Tx did not exist', s, parsedSwapSummary);
        const msg = `Could not confirm ${SwapOfX}.`;
        TGStatusMessage.queue(notificationChannel, msg, false);
        return 'could-not-retrieve-tx';
    }

    return parsedSwapSummary;
}

function shouldIncludeReferralPlatformFee(s : Swappable) : boolean {
    if (isPosition(s)) {
        return true;
    }
    else if (isPositionRequest(s)) {
        return false;
    }
    else {
        throw new Error("Programmer Error.");
    }
}

async function getSwapRoute(s : Swappable, env : Env) : Promise<SwapRoute|GetQuoteFailure> {
    if (isPositionRequest(s)) {
        return getBuyTokenSwapRoute(s, env);
    }
    else if (isPosition(s)) {
        return getSellTokenSwapRoute(s, env);
    }
    else {
        throw new Error("Programmer error.");
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

function parseSwapTransaction(s : Swappable, confirmedTx : PreparseConfirmedSwapResult, userAddress : UserAddress, connection : Connection, env : Env) {
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

function makeUncofirmedTxStatusResult(s: Swappable, signedTx : VersionedTransaction) : PreparseSwapResult {
    const signature = bs58.encode(signedTx.signatures[0]);
    const maybeExecutedTx = { 
        positionID : s.positionID, 
        status: TransactionExecutionErrorCouldntConfirm.UnknownCouldNotConfirm, 
        signature: signature 
    };
    return maybeExecutedTx;
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

function makeTransactionExecutedMessage(s: Swappable) {
    const swapOfX = getSwapOfXDescription(s, true);
    return `${swapOfX} successful.`;
}