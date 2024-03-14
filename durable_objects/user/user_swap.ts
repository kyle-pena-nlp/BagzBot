import { sendMessageToTG } from "../../telegram/telegram_helpers";
import { PositionRequest, Position, PositionStatus, Swappable, isPositionRequest, isPosition, getSwapOfXDescription } from "../../positions/positions";
import { Env } from "../../env";
import { getBuyTokenSwapRoute, getSellTokenSwapRoute } from "../../rpc/jupiter_quotes";
import { serializeSwapRouteTransaction } from "../../rpc/jupiter_serialize";
import { signTransaction } from "../../rpc/rpc_sign_tx";
import { executeRawSignedTransaction } from "../../rpc/rpc_execute_signed_transaction";
import { parseBuySwapTransaction, parseSellSwapTransaction, waitForBlockFinalizationAndParseBuy } from "../../rpc/rpc_parse";
import { importNewPosition as importNewPositionIntoPriceTracker} from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { GetQuoteFailure, PreparseSwapResult, TransactionExecutionError, TransactionExecutionErrorCouldntConfirm, UnknownTransactionParseSummary, isGetQuoteFailure, isTransactionPreparationFailure } from "../../rpc/rpc_types";
import { Wallet } from "../../crypto/wallet";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { PreparseConfirmedSwapResult, 
    PreparseUnconfirmedSwapResult, 
    ParsedSwapSummary, 
    isTransactionExecutionError, 
    isTransactionExecutionErrorCouldntConfirm, 
    SwapExecutionErrorParseSummary, 
    isFailed, 
    isFailedParseSwapSummary, 
    isUnconfirmed, 
    isConfirmed, 
    isUnknownTransactionParseSummary, 
    SwapExecutionError, 
    SwapSummary } from "../../rpc/rpc_types";
import * as bs58 from "bs58";
import { TGStatusMessage, UpdateableNotification } from "../../telegram/telegram_status_message";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { SwapRoute } from "../../rpc/jupiter_types";
/* markPositionAsOpen, renegeOpenPosition */

export async function swap(s: Swappable, 
    wallet : Wallet, 
    env : Env,
    notificationChannel : UpdateableNotification) {

    const logger = async (msg: string, err: any) => {
        console.log(msg + err.toString());
    }

    // get swap route / quote
    const swapOfX = getSwapOfXDescription(s);
    TGStatusMessage.update(notificationChannel, `Finding swap route for ${swapOfX}`, false);
    const swapRoute = await getSwapRoute(s, env).catch(r => null);
    if (swapRoute == null || isGetQuoteFailure(swapRoute)) {
        TGStatusMessage.update(notificationChannel, `Could not get a quote for ${swapOfX} - purchase failed. Try again soon.`, true);
        return;
    }    

    // serialize swap route 
    TGStatusMessage.update(notificationChannel, `Serialzing swap`, false);
    const txBuffer = await serializeSwapRouteTransaction(swapRoute, wallet.publicKey, env).catch(r => null);
    if (txBuffer == null || isTransactionPreparationFailure(txBuffer)) {
        TGStatusMessage.update(notificationChannel, `Could not prepare transaction - ${swapOfX} failed.`, true);
        return;
    }

    // sign tx
    TGStatusMessage.update(notificationChannel, `Signing transaction`, false);
    const signedTx = await signTransaction(txBuffer, wallet, env).catch(r => null);
    if (signedTx == null || isTransactionPreparationFailure(signedTx)) {
        TGStatusMessage.update(notificationChannel, `Could not prepare transaction - ${swapOfX} failed.`, true);
        return;
    }

    // get some stuff we'll need
    const connection = new Connection(env.RPC_ENDPOINT_URL);
    const signature = bs58.encode(signedTx.signatures[0]);

    // attempt to execute tx
    TGStatusMessage.update(notificationChannel, `Executing transaction`, false);
    let maybeExecutedTx = await executeRawSignedTransaction(s.positionID, signedTx, connection, env, logger)
        .catch(r => makeUnknownStatusResult(s, signedTx));
    
    const executionStatusMsg = sendMessageToUserAboutExecutionStatus(s, maybeExecutedTx, env);
    TGStatusMessage.update(notificationChannel, executionStatusMsg, false);
    
    // if failed, bail out and tell user
    if (isFailed(maybeExecutedTx)) {
        return;
    }
    
    // if unconfirmed (but possiblt executed), wait and then attempt to parse
    TGStatusMessage.update(notificationChannel, `Parsing transaction`, false);
    const parsedSwapSummary = await getParsedSwapSummary(s, maybeExecutedTx, signature, connection, env);
    
    // if the tx couldn't be found, then assume the tx was dropped and tell the user.
    if (isUnknownTransactionParseSummary(parsedSwapSummary)) {
        const txNotFoundMsg = makeTxNotFoundMessage(parsedSwapSummary, s);
        TGStatusMessage.update(notificationChannel, txNotFoundMsg, true);
        return;
    }

    // if the swap failed for some reason (like insufficient funds or slippage), let the user know and bail.
    if (isFailedParseSwapSummary(parsedSwapSummary)) {
        const failedMsg = makeSwapSummaryFailedMessage(parsedSwapSummary, s);
        TGStatusMessage.update(notificationChannel, failedMsg, true);
        return;
    }

    return parsedSwapSummary;
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

function makeSwapSummaryFailedMessage(parsedSwapResult : SwapExecutionErrorParseSummary, s: Swappable) : string {
    const status = parsedSwapResult.status;
    const swapOfX = getSwapOfXDescription(s, true);
    switch(status) {
        case SwapExecutionError.InsufficientBalance:
            return `${swapOfX} was not executed.`;
        case SwapExecutionError.SlippageToleranceExceeded:
            return `${swapOfX} was not executed.  The slippage tolerance was exceeded (price moved too fast).`
        case SwapExecutionError.OtherSwapExecutionError:
            return `${swapOfX} failed.`
        default:
            throw new Error("Programmer error.");
    }
}

async function getParsedSwapSummary(s: Swappable, 
    maybeExecutedTx : PreparseConfirmedSwapResult|PreparseUnconfirmedSwapResult, 
    signature: string,
    connection : Connection,
    env : Env) : Promise<ParsedSwapSummary> {

    // if unconfirmed, retry parsing after waiting for current block to finalize
    if (isUnconfirmed(maybeExecutedTx)) {
        const unconfirmedMsg = makeTransactionUnconfirmedMessage(s, maybeExecutedTx.status);
        sendMessageToTG(s.chatID, unconfirmedMsg, env);
        return waitForBlockFinalizationAndParseBuy(s, signature, connection, env);
    }

    if (!isConfirmed(maybeExecutedTx)) {
        throw new Error("Programmer error.");
    }

    // if confirmed
    const confirmedMsg = makeTransactionExecutedMessage(s);
    sendMessageToTG(s.chatID, confirmedMsg, env);
    return parseSwapTransaction(s, maybeExecutedTx, connection, env)

}

function parseSwapTransaction(s : Swappable, confirmedTx : PreparseConfirmedSwapResult, connection : Connection, env : Env) {
    if (isPositionRequest(s)) {
        return parseBuySwapTransaction(s, confirmedTx, connection, env);
    }
    else if (isPosition(s)) {
        return parseSellSwapTransaction(s, confirmedTx, connection, env);
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


function sendMessageToUserAboutExecutionStatus(s: Swappable, executedTx : PreparseSwapResult, env : Env) : string {
    if (isFailed(executedTx)) {
        const errorMsg = makeTransactionFailedErrorMessage(s, executedTx.status);
        return errorMsg;
    }
    else if (isUnconfirmed(executedTx)) {
        const possibleErrorMsg = makeTransactionUnconfirmedMessage(s, executedTx.status);
        return possibleErrorMsg;
    }
    else if (isConfirmed(executedTx)) {
        const executedMsg = makeTransactionExecutedMessage(s);
        return executedMsg;
    }
    throw new Error("Programmer error.");
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
            return `${swapOfX} failed.`
        case TransactionExecutionError.CouldNotDetermineMaxBlockheight:
            return `${swapOfX} failed because a 3rd party service is down.`;
        default:
            throw new Error("Programmer error.");
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
            return `${swapOfXCaps} could be confirmed within time limit. ${weWillRetry}.`;
        case TransactionExecutionErrorCouldntConfirm.Unknown:
            return `Something went wrong and ${swapOfX} could not be confirmed.  ${weWillRetry}.`;
        default:
            throw new Error("Programmer error.");
    }
}

function makeTransactionExecutedMessage(s: Swappable) {
    const swapOfX = getSwapOfXDescription(s);
    return `${swapOfX} successful.`;
}

