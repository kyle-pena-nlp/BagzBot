import { Connection, SendOptions, SignatureStatus, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Buffer } from "node:buffer";
import { Env } from "../env";
import { logDebug, logError } from "../logging";
import { assertNever, sleep, strictParseInt } from "../util";
import { assertIs } from "../util/enums";
import {
    SwapExecutionError,
    TransactionExecutionError,
    TransactionExecutionErrorCouldntConfirm
} from "./rpc_types";

/*
    Send a transaction.
    This does not say whether the swap failed or succeeded,
    only the state of the transaction itself!
*/
export async function executeAndConfirmSignedTx(
    rawSignedTx : VersionedTransaction, 
    lastValidBlockHeight : number,
    connection : Connection,
    env : Env,
    startTimeMS : number) : Promise<'confirmed'|'failed'|'unconfirmed'> {

    const isTimedOut : () => boolean = () => {
        return (Date.now() - startTimeMS) > strictParseInt(env.TX_TIMEOUT_MS);
    }

    // Define some settings
    const RPC_MAX_SEND_EXCEPTIONS = 10;
    const RPC_MAX_CONFIRM_EXCEPTIONS = parseInt(env.RPC_MAX_CONFIRM_EXCEPTIONS,10);
    const REBROADCAST_DELAY_MS = parseInt(env.RPC_REBROADCAST_DELAY_MS, 10);
    const REATTEMPT_CONFIRM_DELAY = parseInt(env.RPC_REATTEMPT_CONFIRM_DELAY, 10);
    const RPC_SEND_MAX_RETRIES = strictParseInt(env.RPC_SEND_RAW_TRANSACTION_MAX_RETRIES);

    // transform tx to buffer, extract signature yo damn self
    const txBuffer = Buffer.from(rawSignedTx.serialize());
    const signature = bs58.encode(rawSignedTx.signatures[0]);

    // very carefully chosen opts for sending tx's
    const sendOpts : SendOptions = {
        skipPreflight : true,
        maxRetries: RPC_SEND_MAX_RETRIES, 
        preflightCommitment: 'confirmed' // per: https://solana.com/docs/core/transactions/confirmation#use-an-appropriate-preflight-commitment-level
    };    

    // options for checking signature status
    const sigStatOpts = { searchTransactionHistory: false };

    let stopSendingTx = false;
    let stopConfirming = false;
    let anyTxSent = false;
    let sendLoopState : 'normal'|'blockhash-expired'|'too-many-exceptions' = 'normal';
    let confirmLoopState : 'unconfirmed'|'tx-dropped'|'timed-out'|'too-many-exceptions'|'confirmed' = 'unconfirmed';

    const sendTransactionTask = (async () => {

        // exception counting, exp backoff
        let sendRpcExceptions = 0;
        let sendExpBackoffFactor = 1.0;
        const increaseExpBackoff = () => { 
            logDebug("Increasing backoff", signature);
            sendExpBackoffFactor = Math.min(8, 2 * sendExpBackoffFactor);
        };

        // Until this loop is signalled to stop by the confirm loop
        while(!stopSendingTx) {

            logDebug("Sending tx", signature);

            // try to send the tx. if it sends w/o exception, set anyTxSent to true.
            await connection.sendRawTransaction(txBuffer, sendOpts)
                .then(_ => { anyTxSent = true; })
                .catch(e => {
                    if (is429(e)) {
                        logDebug('429 sending raw transaction')
                        increaseExpBackoff();
                    }
                    else {
                        logError("sendRawTransaction threw an exception", e);
                        sendRpcExceptions += 1;
                    }
                });

            const blockheight = await connection.getBlockHeight('confirmed').catch(e => {
                if (is429(e)) {
                    logDebug('429 retrieving blockheight');
                    increaseExpBackoff();
                }
                else {
                    logError("send loop - could not poll blockheight");
                    sendRpcExceptions += 1;
                }
                return null;
            });

            if (blockheight != null && blockheight > lastValidBlockHeight) {
                logDebug("send loop - blockhash expired - stopping send tx");
                sendLoopState = 'blockhash-expired';
                break;
            }

            if (sendRpcExceptions > RPC_MAX_SEND_EXCEPTIONS) {
                // TODO: better error enum
                sendLoopState = 'too-many-exceptions';
                break;
            }

            await sleep(sendExpBackoffFactor * REBROADCAST_DELAY_MS);
        }

        // confirmation is a worthy activity only if at least one tx was sent to the RPC
        if (!anyTxSent) {
            logDebug("No tx sent - stopping confirmation loop");
            stopConfirming = true;
        }
    })();

    /*
        Async loop: re-attempt confirmation until:
            (A) signature is confirmed or finalized
            (B) transaction itself has an error
            (C) send-transaction task tells us to stop trying to confirm
    */
    const confirmTransactionTask = (async () => {

        let confirmRpcExceptions = 0;
        let confirmExpBackoffFactor = 1.0;
        const increaseExpBackoff = () => { 
            confirmExpBackoffFactor = Math.min(8, 2 * confirmExpBackoffFactor);
        };        
        
        while(!stopConfirming) {

            if (isTimedOut()) {
                confirmLoopState = 'timed-out';
                break;
            }

            // don't bother running confirmation if at least 1 tx hasn't been sent. check again real soon.
            if (!anyTxSent) {
                await sleep(100);
                continue;
            }
            
            let hasA429 = false;

            // get BH (intentionally getting this before getting sig status below)
            const blockheight : number|'429'|'api-call-failed' = await connection.getBlockHeight('confirmed').catch(e => {
                if (is429(e)) {
                    logDebug('429 getting blockheight');
                    hasA429 = true;
                    return '429';
                }
                else {
                    logError(e);
                    confirmRpcExceptions += 1;
                    return 'api-call-failed';
                }
            });

            // get signature status
            logDebug("confirm loop - getting signature status");
            const signatureStatus : SignatureStatus|'tx-DNE'|'429'|'api-call-failed' = await connection.getSignatureStatus(signature, sigStatOpts)
                .then(res => { return (res.value == null) ? 'tx-DNE' : res.value })
                .catch(e => {
                    if (is429(e)) {
                        logDebug('429 getting signature status');
                        hasA429 = true;
                        return '429';
                    }
                    else {
                        logError("getSignatureStatus threw an exception", e);
                        confirmRpcExceptions += 1;
                        return 'api-call-failed'
                    }
                });

            if (hasA429) {
                increaseExpBackoff();
            }

            if (signatureStatus === '429') {
                // no-op. allow for reattempt of confirmation.
            }
            else if (signatureStatus == 'api-call-failed') {
                // no-op. allow for reattempt of confirmation
            }
            else if (signatureStatus == 'tx-DNE') {
                // if the tx DNE and the blockheight 
                if (blockheight !== '429' && blockheight !== 'api-call-failed' && blockheight > lastValidBlockHeight) {
                    confirmLoopState = 'tx-dropped';
                    break;
                }
            }
            else if ('slot' in signatureStatus) {
                confirmLoopState = 'confirmed'; // maybe the swap failed, but the tx certainly executed.
                break;
            }
            else {
                assertNever(signatureStatus);
            }

            if (confirmRpcExceptions > RPC_MAX_CONFIRM_EXCEPTIONS) {
                confirmLoopState = 'too-many-exceptions';
                break;
            }

            await sleep(confirmExpBackoffFactor * REATTEMPT_CONFIRM_DELAY);
        }
        // this line is very important
        stopSendingTx = true;
    })();

    await Promise.all([sendTransactionTask, confirmTransactionTask]);

    const finalStatus = finalExecutionDisposition(sendLoopState, confirmLoopState);

    logDebug(sendLoopState, confirmLoopState, finalStatus, signature);

    return finalStatus;
}

function finalExecutionDisposition(
    sendLoopState : 'normal'|'blockhash-expired'|'too-many-exceptions', 
    confirmLoopState : 'unconfirmed'|'tx-dropped'|'timed-out'|'too-many-exceptions'|'confirmed') : 'confirmed'|'failed'|'unconfirmed' {

        if (confirmLoopState === 'confirmed') {
            return 'confirmed';
        }
        else if (confirmLoopState === 'tx-dropped') {
            return 'failed';
        }
        else {
            return 'unconfirmed';
        }

}

function is429(e : any) {
    return (e?.message||'').includes("429");
}

function determineTxConfirmationFinalStatus(
    anyTxSent : boolean,
    sendStatus : TransactionExecutionError|undefined, 
    confirmStatus : TransactionExecutionError|'timed-out'|TransactionExecutionErrorCouldntConfirm|SwapExecutionError|'transaction-confirmed'|undefined) : 
    SwapExecutionError | TransactionExecutionError | TransactionExecutionErrorCouldntConfirm | 'transaction-confirmed' {
    
    // no tx sent whatsoever... a severe form of failure
    if (!anyTxSent) {
        return TransactionExecutionError.TransactionFailedOtherReason
    }

    assertIs<true, typeof anyTxSent>();

    if (confirmStatus == 'timed-out') {
        return TransactionExecutionErrorCouldntConfirm.TimeoutCouldNotConfirm;
    }

    if (confirmStatus != null) {
        return confirmStatus;
    }
    else if (sendStatus != null) {
        return sendStatus;
    }
    else {
        return TransactionExecutionErrorCouldntConfirm.UnknownCouldNotConfirm;
    }
}

function interpretTxSignatureStatus(status : SignatureStatus) : 'failed'|'unconfirmed'|'succeeded' {
                
    // If the status has an err object, failed!
    const err = status.err;
    if (err) {
        return 'failed';
    }
    
    // If the transaction itself was confirmed or finalized, (but no error), success!
    const confirmationStatus = status.confirmationStatus;
    if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
        return 'succeeded';
    }

    // I think having at least 1 confirmation is too optimistic and getParsed will fail.
    // If the tx has at least one confirmation (but no error), success!
    /*const hasConfirmations = (status.confirmations || 0) > 0;
    if (hasConfirmations) {
        return 'succeeded';
    }*/

    // otherwise, no error, but no confirmations or confirmationStatus in (confirmed,finalized)
    // ...that means unconfirmed.
    return 'unconfirmed';
}