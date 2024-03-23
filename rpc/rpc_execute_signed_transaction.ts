import { Connection, SignatureStatus, VersionedTransaction } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Buffer } from "node:buffer";
import { Env } from "../env";
import { logError } from "../logging";
import { sleep } from "../util";
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
            let result : SignatureStatus|null = null;
            try {
                
                // get signature status
                result = (await connection.getSignatureStatuses([signature], {
                    searchTransactionHistory: false
                })).value[0];

                // if the tx doesn't exist yet
                const txDoesNotExistYet = result == null;
                if (txDoesNotExistYet) {
                    // if tx DNE and blockheight exceeded, tx was dropped (TODO: is this certainly true?)
                    const currentBlockheight = await getLatestBlockheight(connection).catch((reason) => null);
                    if (currentBlockheight && (currentBlockheight > lastValidBlockheight)) {
                        logError("No transaction found", signature);
                        return TransactionExecutionError.TransactionDropped;// 'transaction-dropped';
                    }
                    if (!currentBlockheight) {
                        logError('Could not poll currentBlockheight', signature);
                    } 
                }
            }
            catch(e) {
                confirmExceptions++;
                logError('getSignatureStatuses threw an exception', e, signature);
            }

            /* If the transaction itself failed, exit confirmation loop with 'transaction-failed'. */
            const err = result?.err;
            if (err) {
                logError('Transaction failed', err, signature);
                stopSendingTx = true;
                return parseSwapExecutionError(err, rawSignedTx, env);
            }
            /* If the transaction itself was confirmed or finalized, exit confirmation loop with 'transaction-confirmed' */
            const status = result?.confirmationStatus;
            const hasConfirmations = (result?.confirmations || 0) > 0;
            if ((hasConfirmations || (status === 'confirmed' || status === 'finalized'))) {
                stopSendingTx = true;
                return 'transaction-confirmed';
            }

            await sleep(REATTEMPT_CONFIRM_DELAY);

            /* i.e.; RPC is down. */
            if (confirmExceptions >= maxConfirmExceptions) {
                return TransactionExecutionErrorCouldntConfirm.CouldNotConfirmTooManyExceptions; //'confirmation-too-many-exceptions';
            }

            // this is a failsafe to prevent infinite looping.
            const confirmTimedOut = (Date.now() - startConfirmMS) > confirmTimeoutMS;
            if (confirmTimedOut) {
                stopSendingTx = true;
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

function parseSendRawTransactionException(e : any) : string|null {
    // TODO: detect insufficient funds correctly (or other important info)
    return null;
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

