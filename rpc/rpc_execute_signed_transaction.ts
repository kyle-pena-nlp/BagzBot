import { Connection, SignatureStatus, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Buffer } from "node:buffer";
import { Env } from "../env";
import { logDebug, logError } from "../logging";
import { assertNever, sleep, strictParseInt } from "../util";
import { assertIs } from "../util/enums";
import { parseInstructionError } from "./rpc_parse_instruction_error";
import {
    PreparseSwapResult,
    SwapExecutionError,
    TransactionExecutionError,
    TransactionExecutionErrorCouldntConfirm
} from "./rpc_types";

// this method is unholy and needs to be split up.
export async function executeAndMaybeConfirmTx(
    positionID : string,
    rawSignedTx : VersionedTransaction, 
    lastValidBlockHeight : number,
    connection : Connection,
    env : Env,
    startTimeMS : number) : Promise<PreparseSwapResult> {

    const isTimedOut : () => boolean = () => {
        return (Date.now() - startTimeMS) > strictParseInt(env.TX_TIMEOUT_MS);
    }

    // Define some settings
    const maxConfirmRpcExceptions = parseInt(env.RPC_MAX_CONFIRM_EXCEPTIONS,10);
    const REBROADCAST_DELAY_MS = parseInt(env.RPC_REBROADCAST_DELAY_MS, 10);
    const REATTEMPT_CONFIRM_DELAY = parseInt(env.RPC_REATTEMPT_CONFIRM_DELAY, 10);

    // transform tx to buffer, extract signature yo damn self
    const txBuffer = Buffer.from(rawSignedTx.serialize());
    const signature = bs58.encode(rawSignedTx.signatures[0]);
    
    /*
        We are going to set up two async loops ;
            One for resending the tx until blockheight exceeded
            One for confirming until timeout or (signature not found AND blockheight exceeded)
    */

    let stopSendingTx = false;
    let stopConfirming = false;
    let anyTxSent = false;

    const resendTxTask = (async () => {

        // Count failures (i.e.; 429 errors)
        let rpcExceptions = 0;

        // TODO: make it a setting
        const maxRPCSendExceptions = 10;

        let returnStatus : TransactionExecutionError|'timed-out'|undefined = undefined;
        
        let expBackoffFactor = 1.0;

        // Until this loop is signalled to stop
        while(!stopSendingTx) {

            // try to send the tx. if it sends w/o exception, set anyTxSent to true.
            logDebug("Attempting to send tx")
            await connection.sendRawTransaction(txBuffer, {
                skipPreflight : true,
                maxRetries: strictParseInt(env.RPC_SEND_RAW_TRANSACTION_MAX_RETRIES), 
                // per: https://solana.com/docs/core/transactions/confirmation#use-an-appropriate-preflight-commitment-level
                preflightCommitment: 'confirmed'
            }).then(async _ => {
                anyTxSent = true;
                logDebug("Tx successfully sent.");
                if (expBackoffFactor > 1) {
                    logDebug("Halving exp backoff");
                    expBackoffFactor = expBackoffFactor / 2.0;
                }
                
            })
            .catch(e => {
                rpcExceptions += 1;
                logError("sendRawTransaction threw an exception", e, signature);
                if ((e.message as string).includes("429")) {
                    if (expBackoffFactor < 8) {
                        logDebug("Doubling exp backoff");
                        expBackoffFactor = Math.min(2.0 * expBackoffFactor,8.0);
                    }
                }
            });

            const blockheight = await connection.getBlockHeight('confirmed').catch(r => {
                logError("send loop - could not poll blockheight");
                return null;
            });

            // if we cannot poll blockheight, immediately terminate send loop (otherwise, 429 -> infinite loop)
            if (blockheight == null) {
                rpcExceptions += 1;
            }

            if (blockheight != null && blockheight > lastValidBlockHeight) {
                logDebug("send loop - blockhash expired - stopping send tx");
                returnStatus = TransactionExecutionError.BlockheightExceeded;
                break;
            }

            if (rpcExceptions > maxRPCSendExceptions) {
                // TODO: better error enum
                returnStatus = TransactionExecutionError.TransactionFailedOtherReason;
                break;
            }

            await sleep(expBackoffFactor * REBROADCAST_DELAY_MS);
        }

        // confirmation is a worthy activity only if at least one tx was sent to the RPC
        if (!anyTxSent) {
            logDebug("No tx sent - stopping confirmation loop");
            stopConfirming = true;
        }

        return returnStatus;
    })();

    /*
        Async loop: re-attempt confirmation until:
            (A) signature is confirmed or finalized
            (B) transaction itself has an error
            (C) send-transaction task tells us to stop trying to confirm
    */
    const confirmTransactionTask = (async () => {

        let rpcExceptions = 0;
        let returnStatus : TransactionExecutionError | 
            TransactionExecutionErrorCouldntConfirm | 
            SwapExecutionError | 
            'timed-out'|
            'transaction-confirmed' | 
            undefined = undefined;
        
        while(!stopConfirming) {

            if (isTimedOut()) {
                returnStatus = 'timed-out';
                break;
            }

            // don't bother running confirmation if at least 1 tx hasn't been sent. check again real soon.
            if (!anyTxSent) {
                await sleep(100);
                continue;
            }
            
            // get signature status
            logDebug("confirm loop - getting signature status");
            const sigStatOpts = { searchTransactionHistory: false }; // TODO: should this change?
            const signatureStatus : SignatureStatus|'tx-does-not-exist'|'get-signature-status-method-failed' = await connection.getSignatureStatus(signature, sigStatOpts)
                .then(res => { return (res.value == null) ? 'tx-does-not-exist' : res.value })
                .catch(e => {
                    logError("getSignatureStatus threw an exception", e, signature)
                    return 'get-signature-status-method-failed'
                });

            // if we successfully got the signature status...
            const isSignatureStatus = typeof signatureStatus === 'object' && 'slot' in signatureStatus;
            if (isSignatureStatus) {
                // parse it.
                const simpleTxSigStatus = interpretTxSignatureStatus(signatureStatus);
                // if the tx failed, end confirmation loop, indicate parsed error
                if (simpleTxSigStatus === 'failed') {
                    logDebug("confirm loop - tx failed", signature);                    
                    returnStatus = parseSwapExecutionError(signatureStatus.err, rawSignedTx, env);
                    break;
                }
                // if the tx failed, end confirmation loop, indicate success
                else if (simpleTxSigStatus === 'succeeded') {
                    logDebug("confirm loop - tx succeeded", signature);
                    returnStatus = 'transaction-confirmed';
                    break;
                }
                // if the tx is still unconfirmed, keep going.
                else if (simpleTxSigStatus === 'unconfirmed') {
                    logDebug("confirm loop - tx unconfirmed - reattempting confirmation", signature);
                }
                else {
                    assertNever(simpleTxSigStatus);
                }
            }
            else if (signatureStatus === 'tx-does-not-exist') {

                const blockheight = await connection.getBlockHeight('confirmed').catch(r => {
                    logError("send loop - could not poll blockheight");
                    return null;
                });

                if (blockheight == null) {
                    logError("confirm loop - could not determine blockheight");
                    rpcExceptions += 1;
                }
                else if (blockheight != null && blockheight <= lastValidBlockHeight) {
                    logDebug("tx not found yet blockhash still valid");
                }
                else if (blockheight != null && blockheight > lastValidBlockHeight) {
                    logError("tx not found and blockhash expired - considered dropped", signature);
                    returnStatus = TransactionExecutionError.TransactionDropped;
                    break;
                }
            }
            // if could not get sig status due to RPC error, increment exception count
            else if (signatureStatus === 'get-signature-status-method-failed') {
                logDebug('confirm loop - failure determining sig status')
                rpcExceptions += 1;
            }
            else {
                assertNever(signatureStatus);
            }

            /* if too many exception, could not confirm. stop reattempting confirmation */
            if (rpcExceptions >= maxConfirmRpcExceptions) {
                logError("Too many exceptions when trying to confirm", signature);                
                returnStatus = TransactionExecutionErrorCouldntConfirm.CouldNotConfirmTooManyExceptions; //'confirmation-too-many-exceptions';
                break;
            }

            await sleep(REATTEMPT_CONFIRM_DELAY);
        }
        logDebug('confirm loop ended - stopping send of tx')
        stopSendingTx = true;
        return returnStatus;
    })();

    const confirmStatus = await confirmTransactionTask;
    const sendStatus = await resendTxTask;

    const finalStatus = determineTxConfirmationFinalStatus(anyTxSent, sendStatus, confirmStatus);

    return { 
        positionID : positionID, 
        status: finalStatus, 
        signature: signature
    };
}

function parseSwapExecutionError(err : any, rawSignedTx : VersionedTransaction, env : Env) : SwapExecutionError {
    const instructionError = err?.InstructionError;
    if (instructionError) {
        try {
            const swapExecutionError = parseInstructionError(instructionError, env);
            return swapExecutionError;
        }
        catch {
            return SwapExecutionError.OtherSwapExecutionError;
        }
    }

    return SwapExecutionError.OtherSwapExecutionError;
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