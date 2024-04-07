import { Connection, GetVersionedTransactionConfig, ParsedTransactionWithMeta, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { UserAddress, Wallet, toUserAddress } from "../../crypto";
import { Env } from "../../env";
import { logDebug, logError } from "../../logging";
import { Swappable, getSwapOfXDescription, isPosition, isPositionRequest } from "../../positions";
import { executeAndConfirmSignedTx } from "../../rpc/rpc_execute_signed_transaction";
import { parseBuySwapTransaction, parseParsedTransactionWithMeta, parseSellSwapTransaction } from "../../rpc/rpc_parse";
import { ParsedSwapSummary, PreparseConfirmedSwapResult, SwapExecutionError, TransactionExecutionError, TransactionExecutionErrorCouldntConfirm, UnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever, sleep, strictParseInt } from "../../util";

export class SwapExecutor {
    wallet : Wallet
    type : 'buy'|'sell'
    env : Env
    notificationChannel: UpdateableNotification
    connection : Connection
    lastValidBH : number
    startTimeMS : number
    constructor(wallet : Wallet, 
        type : 'buy'|'sell',
        env : Env, 
        notificationChannel : UpdateableNotification, 
        connection : Connection,
        lastValidBH : number,
        startTimeMS : number) {
        this.wallet = wallet;
        this.type = type;
        this.env = env;
        this.notificationChannel = notificationChannel;
        this.connection = connection;
        this.lastValidBH = lastValidBH
        this.startTimeMS = startTimeMS;
    }

    async executeTxAndParseResult(s : Swappable, signedTx : VersionedTransaction) : Promise<'tx-failed'|'unconfirmed'|ParsedSwapSummary> {

        // get some stuff we'll need
        const signature = bs58.encode(signedTx.signatures[0]);
        
        TGStatusMessage.queue(this.notificationChannel, `Executing transaction... (can take a bit)`, false);
        
        let txExecutionStatus = await executeAndConfirmSignedTx(signedTx, this.lastValidBH, this.connection, this.env, this.startTimeMS);

        if (txExecutionStatus === 'failed') {
            return 'tx-failed';
        }
        else if (txExecutionStatus === 'unconfirmed') {
            return 'unconfirmed';
        }
        else if (txExecutionStatus === 'confirmed') {
            const rawParsedTx =  await this.getParsedTx(signature, 3000);
            if (rawParsedTx === 'timed-out') {
                return 'unconfirmed';
            }
            else if ('slot' in rawParsedTx) {
                const inTokenAddress = this.getInTokenAddress(s);
                const outTokenAddress = this.getOutTokenAddress(s);
                return parseParsedTransactionWithMeta(rawParsedTx, inTokenAddress, outTokenAddress, signature, toUserAddress(this.wallet), this.env)
            }
            else {
                assertNever(rawParsedTx);
            }
        }
        else {
            assertNever(txExecutionStatus);
        }
    }

    async getParsedTx(signature : string, parseTimeoutMS : number) : Promise<'timed-out'|ParsedTransactionWithMeta> {
        const startParseMS = Date.now();
        let expBackoffFactor = 1.0;
        const increaseExpBackoff = () => {
            expBackoffFactor = Math.min(8, 2 * expBackoffFactor);
        };
        const opts : GetVersionedTransactionConfig = { maxSupportedTransactionVersion: 0, commitment: 'confirmed' };
        const isTimedOut = () => {
            return Date.now() > Math.min(startParseMS + parseTimeoutMS, this.startTimeMS + strictParseInt(this.env.TX_TIMEOUT_MS));
        };
        while (!isTimedOut()) {
            const parsedTransaction = await this.connection.getParsedTransaction(signature, opts)
            .then(tx => tx == null ? 'tx-DNE' : tx)
            .catch(e => {
                if (is429(e)) {
                    logDebug('429 retrieving parsed transaction');
                    increaseExpBackoff();
                    return '429';
                }
                else {
                    logError(e);
                    return 'error';
                }
            });
            if (typeof parsedTransaction !== 'string') {
                return parsedTransaction;
            }
            sleep(expBackoffFactor * 500);
        }
        return 'timed-out';
    }   

    getInTokenAddress(s : Swappable) : string {
        if (this.type === 'buy') {
            return s.vsToken.address;
        }
        else if (this.type === 'sell') {
            return s.token.address;
        }
        else {
            assertNever(this.type);
        }
    }

    getOutTokenAddress(s : Swappable) : string {
        if (this.type === 'buy') {
            return s.token.address;
        }
        else if (this.type === 'sell') {
            return s.vsToken.address;
        }
        else {
            assertNever(this.type);
        }
    }
}

function is429(e: any) : boolean {
    return (e?.message||'').includes("429");
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


