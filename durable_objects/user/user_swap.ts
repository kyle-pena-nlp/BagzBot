import { Connection, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { UserAddress, Wallet, toUserAddress } from "../../crypto";
import { Env } from "../../env";
import { logError, logInfo } from "../../logging";
import { Swappable, getSwapOfXDescription, isPosition, isPositionRequest } from "../../positions";
import { getBuyTokenSwapRoute, getSellTokenSwapRoute } from "../../rpc/jupiter_quotes";
import { serializeSwapRouteTransaction } from "../../rpc/jupiter_serialize";
import { SwapRoute } from "../../rpc/jupiter_types";
import { executeRawSignedTransaction } from "../../rpc/rpc_execute_signed_transaction";
import { parseBuySwapTransaction, parseSellSwapTransaction, waitForBlockFinalizationAndParse } from "../../rpc/rpc_parse";
import { signTransaction } from "../../rpc/rpc_sign_tx";
import { GetQuoteFailure, ParsedSuccessfulSwapSummary, ParsedSwapSummary, PreparseConfirmedSwapResult, PreparseSwapResult, SwapExecutionError, TransactionExecutionError, TransactionExecutionErrorCouldntConfirm, UnknownTransactionParseSummary, isConfirmed as isConfirmedTxExecution, isFailedSwapTxExecution, isFailedTxExecution, isGetQuoteFailure, isSuccessfullyParsedSwapSummary, isSwapExecutionErrorParseSwapSummary, isTransactionPreparationFailure, isUnconfirmedTxExecution, isUnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
/* markPositionAsOpen, renegeOpenPosition */

export async function swap(s: Swappable, 
    wallet : Wallet, 
    env : Env,
    notificationChannel : UpdateableNotification) : Promise<ParsedSuccessfulSwapSummary|undefined> {

    // get swap route / quote
    const swapOfX = getSwapOfXDescription(s);
    const SwapOfX = getSwapOfXDescription(s, true);

    const swapRoute = await getSwapRoute(s, env).catch(r => null);
    if (swapRoute == null || isGetQuoteFailure(swapRoute)) {
        logError("Failed getting swap route", s, swapRoute);
        TGStatusMessage.queue(notificationChannel, `Could not get a quote for ${swapOfX} - purchase failed. Try again soon.`, true);
        return;
    }
    else{
        TGStatusMessage.queue(notificationChannel, `Quote found for ${swapOfX}`, false);
    }

    // serialize swap route 
    const txBuffer = await serializeSwapRouteTransaction(swapRoute, wallet.publicKey, shouldIncludeReferralPlatformFee(s), env).catch(r => null);
    if (txBuffer == null || isTransactionPreparationFailure(txBuffer)) {
        logError("Failed serializing transaction", s, txBuffer);
        TGStatusMessage.queue(notificationChannel, `Could not prepare transaction - ${swapOfX} failed.`, true);
        return;
    }
    else {
        TGStatusMessage.queue(notificationChannel, `Transaction serialized for ${swapOfX}`, false);
    }

    // sign tx
    const signedTx = await signTransaction(txBuffer, wallet, s.userID, env).catch(r => null);
    if (signedTx == null || isTransactionPreparationFailure(signedTx)) {
        logError("Failed signing transaction", s, signedTx);
        TGStatusMessage.queue(notificationChannel, `Could not sign transaction - ${swapOfX} failed.`, true);
        return;
    }
    else {
        TGStatusMessage.queue(notificationChannel, `Transaction for ${swapOfX} signed.`, false);
    }

    // get some stuff we'll need
    const connection = new Connection(env.RPC_ENDPOINT_URL);
    const signature = bs58.encode(signedTx.signatures[0]);
    const userAddress = toUserAddress(wallet);

    // attempt to execute tx
    TGStatusMessage.queue(notificationChannel, `Executing transaction... (this could take a moment)`, false);
    let maybeExecutedTx = await executeRawSignedTransaction(s.positionID, signedTx, connection, env)
        .catch(r => { 
            logError('Initial execution unexpected failure, converting to unconfirmed', s, r);
            return makeUnknownStatusResult(s, signedTx); 
        });


    // transaction definetely failed to execute
    if (isFailedTxExecution(maybeExecutedTx)) {
        logError('Transaction execution failed', s, maybeExecutedTx);
        const msg = makeTransactionFailedErrorMessage(s, maybeExecutedTx.status);
        TGStatusMessage.queue(notificationChannel, msg, true);
        return;        
    }

    // transaction went through, but swap failed
    if (isFailedSwapTxExecution(maybeExecutedTx)) {
        logError('Swap failed', s, maybeExecutedTx);
        const msg = makeSwapSummaryFailedMessage(maybeExecutedTx.status, s);
        TGStatusMessage.queue(notificationChannel, msg, true);
        return;
    }    

    let parsedSwapSummary : ParsedSwapSummary|null = null;

    // parse if transaction went through
    if (isConfirmedTxExecution(maybeExecutedTx)) {
        logInfo('Transaction confirmed', s, maybeExecutedTx);
        parsedSwapSummary = await parseSwapTransaction(s, maybeExecutedTx, userAddress, connection, env).catch(r => null);
    }

    // if unable to confirm if tx went through, wait and try to parse
    if (isUnconfirmedTxExecution(maybeExecutedTx)) {
        logInfo('Transaction unconfirmed', s, maybeExecutedTx);
        const msg = makeTransactionUnconfirmedMessage(s, maybeExecutedTx.status);
        TGStatusMessage.queue(notificationChannel, msg, false);
        parsedSwapSummary = await waitForBlockFinalizationAndParse(s, signature, userAddress, connection, env).catch(r => null);
    }
    
    // if the act of retrieving the parsed transaction failed altogether...
    if (parsedSwapSummary == null) {
        logError('Unexpected error retrieving transaction', s, { signature : signature });
        const msg = `There was a problem retrieving information about your transaction.`;
        TGStatusMessage.queue(notificationChannel, msg, true);
        return;
    }
    
    // if the RPC *still* says the TX doesn't exist
    if (isUnknownTransactionParseSummary(parsedSwapSummary)) {
        logError('Transaction could not be found', s, parsedSwapSummary, { signature : signature });
        const txNotFoundMsg = makeTxNotFoundMessage(parsedSwapSummary, s);
        TGStatusMessage.queue(notificationChannel, txNotFoundMsg, true);
        return;
    }

    // if parsing the confirmed tx shows there was a problem with the swap
    if (isSwapExecutionErrorParseSwapSummary(parsedSwapSummary)) {
        logError('Swap execution error', s, parsedSwapSummary);
        const failedMsg = makeSwapSummaryFailedMessage(parsedSwapSummary.status, s);
        TGStatusMessage.queue(notificationChannel, failedMsg, true);
        return;
    }

    // if everythint went ok
    if (isSuccessfullyParsedSwapSummary(parsedSwapSummary)) {
        logInfo('Swap successful', s, parsedSwapSummary);
        const msg = `${SwapOfX} was successful.`;
        TGStatusMessage.queue(notificationChannel, msg, false);
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

function makeUnknownStatusResult(s: Swappable, signedTx : VersionedTransaction) : PreparseSwapResult {
    const signature = bs58.encode(signedTx.signatures[0]);
    const maybeExecutedTx = { 
        positionID : s.positionID, 
        status: TransactionExecutionErrorCouldntConfirm.Unknown, 
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
        case TransactionExecutionErrorCouldntConfirm.Unknown:
            return `Something went wrong and ${swapOfX} could not be confirmed.  ${weWillRetry}.`;
        default:
            assertNever(status);
    }
}

function makeTransactionExecutedMessage(s: Swappable) {
    const swapOfX = getSwapOfXDescription(s, true);
    return `${swapOfX} successful.`;
}