import { Connection, SignatureStatus, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Buffer } from "node:buffer";
import { Env } from "../env";
import { logDebug, logError } from "../logging";
import { assertNever, sleep } from "../util";
import { getLastValidBlockheight, getLatestBlockheight } from "./rpc_common";
import { parseInstructionError } from "./rpc_parse_instruction_error";
import {
    PreparseSwapResult,
    SwapExecutionError,
    TransactionExecutionError,
    TransactionExecutionErrorCouldntConfirm
} from "./rpc_types";


export async function executeRawSignedTransaction(
    positionID : string,
    rawSignedTx : VersionedTransaction, 
    connection : Connection,
    env : Env) : Promise<PreparseSwapResult> {

    // Define some settings
    const maxConfirmExceptions = parseInt(env.RPC_MAX_CONFIRM_EXCEPTIONS,10);
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
    let stopConfirmingSignal = false;

    // if the current blockheight exceeds this, the transaction will never execute.
    const lastValidBlockheight = await getLastValidBlockheight(connection).catch((reason) => null);
    if (!lastValidBlockheight) {
        return { 
            positionID: positionID, 
            status: TransactionExecutionError.CouldNotDetermineMaxBlockheight, 
            signature : signature 
        };
    }

    const resendTxTask = (async () => {

        // The current blockheight (will be repolled after every send attempt)
        let blockheight : number = -1;

        // Whether or not at least one tx got successfully sent to RPC
        let anyTxSent = false;
        
        // Until this loop is signalled to stop
        while(!stopSendingTx) {

            /* Attempt to send transaction.  If sent, note that there is something to confirm (`anyTxSent`). */
            try {
                await connection.sendRawTransaction(txBuffer, {
                    skipPreflight : true,
                    maxRetries: 0
                });
                anyTxSent = true;
            }
            catch(e) {
                // failing once may mean RPC rate limit, for example. We can try again. But log it.
                logError("sendRawTransaction threw an exception", e, signature);
            }

            // Sleep to avoid spamming RPC.
            await sleep(REBROADCAST_DELAY_MS);

            // poll RPC for blockheight
            const maybeBlockheight = await getLatestBlockheight(connection).catch(r => {
                logError('Could not poll blockheight', r, signature);
                return null;
            });

            // if polling failed and no transactions have been sent, don't bother trying to confirm.
            if (maybeBlockheight == null && !anyTxSent) {
                stopConfirmingSignal = true;
            }

            // and if polling BH failed, stop trying to send tx. How else will we know to stop?
            if (maybeBlockheight == null) {
                return TransactionExecutionError.CouldNotPollBlockheightNoTxSent;
            }

            blockheight = maybeBlockheight;

            // if we are passed last valid BH and no tx's were sent, don't bother confirming.
            if (blockheight >= lastValidBlockheight && !anyTxSent) {
                stopConfirmingSignal = true;
            }

            // and if we are passed last valid BH, don't bother trying again.
            if (blockheight >= lastValidBlockheight) {
                return TransactionExecutionError.BlockheightExceeded;
            }
        }
        return;
    })();

    /*
        Async loop: re-attempt confirmation until:
            (A) signature is confirmed or finalized
            (B) transaction itself has an error
            (C) send-transaction task tells us to stop trying to confirm
    */
    const confirmTransactionTask = (async () => {

        let confirmExceptions = 0;
        const startConfirmMS = Date.now();
        
        while(!stopConfirmingSignal) {
            
            /* Check the status on the signature */
            let result : SignatureStatus|'DNE'|'method-failed' = 'DNE';
                
            // get signature status
            const sigStatOpts = { searchTransactionHistory: false }; // TODO: should this change?
            result = await connection.getSignatureStatus(signature, sigStatOpts)
                .then(res => { return (res.value == null) ? 'DNE' : res.value })
                .catch(e => {
                    logError("getSignatureStatus threw an exception", e, signature)
                    return 'method-failed'
                });
            
            // if getSignatureStatus itself failed, increment exception count.
            if (result === 'method-failed') {
                confirmExceptions += 1; 
            }
            
            await sleep(REATTEMPT_CONFIRM_DELAY);

            // if the tx doesn't exist...
            if (result === 'DNE') {
                // get the current blockheight
                const currentBH = await getLatestBlockheight(connection).catch((e) => {
                    logError('Could not poll BH', e, signature)
                    return null;
                });
                // and if the current BH exceeds last valid BH, then TX will never exist (i.o.w., TX dropped)
                if (currentBH && currentBH > lastValidBlockheight) {
                    logError("Tx dropped", signature);
                    return TransactionExecutionError.TransactionDropped;
                }
            }

            // if we actually got a signature status...
            if (result !== 'DNE' && result !== 'method-failed') {
                
                const txStatus = getTxStatus(result);

                if (txStatus === 'failed') {
                    stopSendingTx = true;
                    logDebug("Tx failed", signature);
                    return parseSwapExecutionError(result.err, rawSignedTx, env);
                }
                else if (txStatus === 'succeeded') {
                    stopSendingTx = true;
                    logDebug("Tx succeeded", signature);
                    return 'transaction-confirmed';
                }
                else if (txStatus === 'unconfirmed') {
                    logDebug("Tx unconfirmed", signature);
                }
                else {
                    assertNever(txStatus);
                }
            }

            /* i.e.; RPC is down. */
            if (confirmExceptions >= maxConfirmExceptions) {
                stopSendingTx = true;
                logError("Too many exceptions when trying to confirm", signature);                
                return TransactionExecutionErrorCouldntConfirm.CouldNotConfirmTooManyExceptions; //'confirmation-too-many-exceptions';
            }

            // this is a failsafe to prevent infinite looping.
            const confirmTimedOut = (Date.now() - startConfirmMS) > confirmTimeoutMS;
            if (confirmTimedOut) {
                stopSendingTx = true;
                logError("Timed out trying to confirm tx", signature);
                return TransactionExecutionErrorCouldntConfirm.TimeoutCouldNotConfirm;
            }
        }
        return;
    })();

    const confirmStatus = await confirmTransactionTask;
    const sendStatus = await resendTxTask;
    const finalStatus = determineTxConfirmationFinalStatus(sendStatus, confirmStatus);

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
    sendStatus : TransactionExecutionError|undefined, 
    confirmStatus : TransactionExecutionError|TransactionExecutionErrorCouldntConfirm|SwapExecutionError|'transaction-confirmed'|undefined) : SwapExecutionError | TransactionExecutionError | TransactionExecutionErrorCouldntConfirm | 'transaction-confirmed' {
    return confirmStatus || sendStatus || TransactionExecutionErrorCouldntConfirm.Unknown;
}


function getTxStatus(status : SignatureStatus) : 'failed'|'unconfirmed'|'succeeded' {
                
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

    // If the tx has at least one confirmation (but no error), success!
    const hasConfirmations = (status.confirmations || 0) > 0;
    if (hasConfirmations) {
        return 'succeeded';
    }

    // otherwise, no error, but no confirmations or confirmationStatus in (confirmed,finalized)
    // ...that means unconfirmed.
    return 'unconfirmed';
}