import { Connection, SignatureStatus, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Buffer } from "node:buffer";
import { Env } from "../env";
import { logDebug, logError } from "../logging";
import { assertNever, sleep } from "../util";
import { parseInstructionError } from "./rpc_parse_instruction_error";
import {
    PreparseSwapResult,
    SwapExecutionError,
    TransactionExecutionError,
    TransactionExecutionErrorCouldntConfirm
} from "./rpc_types";


export async function executeAndMaybeConfirmTx(
    positionID : string,
    rawSignedTx : VersionedTransaction, 
    connection : Connection,
    env : Env) : Promise<PreparseSwapResult> {

    // Define some settings
    const maxConfirmRpcExceptions = parseInt(env.RPC_MAX_CONFIRM_EXCEPTIONS,10);
    const REBROADCAST_DELAY_MS = parseInt(env.RPC_REBROADCAST_DELAY_MS, 10);
    const REATTEMPT_CONFIRM_DELAY = parseInt(env.RPC_REATTEMPT_CONFIRM_DELAY, 10);
    const confirmTimeoutMS = parseInt(env.RPC_CONFIRM_TIMEOUT_MS, 10);

    // transform tx to buffer, extract signature yo damn self
    const txBuffer = Buffer.from(rawSignedTx.serialize());
    const signature = bs58.encode(rawSignedTx.signatures[0]);
    
    /*
        We are going to set up two async loops ;
            One for resending the tx until blockheight exceeded
            One for confirming until timeout or (signature not found AND blockheight exceeded)
    */

    // The loops can signal eachother to stop by setting these flags.
    let stopSendingTx = false;
    let stopConfirming = false;

    // the blockhash that acts as the nonce for the tx
    const txRecentBlockhash = rawSignedTx.message.recentBlockhash;

    // whether at least 1 tx has been sent.
    let anyTxSent = false;

    const resendTxTask = (async () => {

        // Whether or not at least one tx got successfully sent to RPC
        let rpcExceptions = 0;

        let returnStatus : TransactionExecutionError|undefined = undefined;
        
        // Until this loop is signalled to stop
        while(!stopSendingTx) {

            // try to send the tx. if it sends w/o exception, set anyTxSent to true.
            logDebug("Attempting to send tx")
            await connection.sendRawTransaction(txBuffer, {
                skipPreflight : true,
                maxRetries: 0
            }).then(_ => {
                anyTxSent = true;
                logDebug("Tx successfully sent.")
            })
            .catch(e => {
                rpcExceptions += 1;
                logError("sendRawTransaction threw an exception", e, signature);
            });

            // see if the blockhash the tx was signed with is still valid
            const blockhashValid = await getIsBlockhashValid(txRecentBlockhash, connection);

            // if calling the RPC failed (rate-limited?), increment failure count.
            if (blockhashValid == null) {
                logDebug("Send loop - could not check blockhash")
                rpcExceptions += 1;
            }

            // if there have been too many RPC exceptions, stop re-sending
            if (rpcExceptions > 10) {
                // TODO: more appropriate status
                logDebug("Too many exceptions sending tx");
                returnStatus = TransactionExecutionError.CouldNotDetermineMaxBlockheight;
                break;
            }

            // if the blockhash used to sign the tx is no longer valid, stop re-sending
            if (blockhashValid === false) {
                logDebug("send loop - blockhash expired - stopping send tx");
                returnStatus = TransactionExecutionError.BlockheightExceeded;
                break;
            }

            // Sleep to avoid spamming RPC.
            await sleep(REBROADCAST_DELAY_MS);
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
            'transaction-confirmed' | 
            undefined = undefined;
        
        while(!stopConfirming) {

            // don't bother confirming if at least 1 tx hasn't been sent. check again real soon.
            if (!anyTxSent) {
                await sleep(100);
                continue;
            }
            
            // get signature status
            // note: MAX_RECENT_BLOCKHASHES = 300, which is greater than MAX_VALID_BLOCKHEIGHT = +150
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
                const isValidBlockhash = await getIsBlockhashValid(txRecentBlockhash, connection);
                // if tx sig status DNE and blockhash still valid, reattempt confirmation.
                if (isValidBlockhash === true) {
                    logDebug("Tx DNE yet blockhash still valid - reattempting confirmation");
                }
                // if tx sig status DNE and blockhash expired, tx was dropped.
                else if (isValidBlockhash === false) {
                    logError("Tx dropped", signature);
                    returnStatus = TransactionExecutionError.TransactionDropped;
                    break;
                }
                // if failed to get blockhash status, increment exception count
                else if (isValidBlockhash == null) {
                    logError("Error occurred determining if blockhash is valid")
                    rpcExceptions +=1;
                }
                else {
                    assertNever(isValidBlockhash);
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
        logDebug('confirm loop - stopping send of tx')
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
    confirmStatus : TransactionExecutionError|TransactionExecutionErrorCouldntConfirm|SwapExecutionError|'transaction-confirmed'|undefined) : SwapExecutionError | TransactionExecutionError | TransactionExecutionErrorCouldntConfirm | 'transaction-confirmed' {
    
    if (!anyTxSent) {
        return TransactionExecutionError.TransactionFailedOtherReason
    }
    else if (confirmStatus != null) {
        return confirmStatus;
    }
    else if (sendStatus != null) {
        return sendStatus;
    }
    else {
        return TransactionExecutionErrorCouldntConfirm.UnknownCouldNotConfirm;
    }
}

async function getIsBlockhashValid(txRecentBlockhash : string, connection : Connection) {
    return await connection.isBlockhashValid(txRecentBlockhash, { commitment: 'processed' })
        .then(result => {
            return result.value;
        })
        .catch(e => {
            logError("Unable to determine if blockhash is valid", e);
            return null;
        });
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