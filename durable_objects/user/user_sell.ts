import { Connection } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { Env } from "../../env";
import { logError } from "../../logging";
import { Position } from "../../positions";
import { ParsedSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { markAsOpen, updateSellConfirmationStatus } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapExecutor, TransactionExecutionResult } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";
import { assertNever } from "../../util";


export async function sell(position: Position, 
    wallet : Wallet, 
    env : Env,
    startTimeMS : number) : Promise<void> {

    const notificationChannel = TGStatusMessage.createAndSend('Initiating sell', false, position.chatID, env);

    const swapExecutionResult = await sellPosition(position, wallet, env, notificationChannel, startTimeMS);

    if (swapExecutionResult === 'tx-failed') {
        // if we couldn't even create a tx, then mark the position as open again
        // (price tracking will fire it off again if need be)
        await markAsOpen(position.positionID, 
            position.token.address, 
            position.vsToken.address, env);
    }
    else {

        const updatedStatusOfSell = determineStatus(swapExecutionResult.result);

        // If we could at least create a tx, update the position according to the swap status
        // failed -> open
        // tx failed or swap failed -> open
        // slippage failed -> open, but maybe double slippage
        // unconfirmed -> keep as 'closing', mark as needing confirmation
        // success -> mark as closed
        // We store the signature and last valid BH because we might need it for delayed confirmation.
        await updateSellConfirmationStatus(position.positionID, 
            swapExecutionResult.signature,
            swapExecutionResult.lastValidBH,
            position.token.address, 
            position.vsToken.address, 
            updatedStatusOfSell, 
            env);
    }
}

function determineStatus(result : ParsedSuccessfulSwapSummary|'could-not-confirm'|'swap-failed'|'swap-failed-slippage') {
    if (isSuccessfullyParsedSwapSummary(result)) {
        return 'confirmed';
    }
    else if (result === 'could-not-confirm') {
        return 'unconfirmed';
    }
    else if (result === 'swap-failed')  {
        return 'failed';
    }
    else if (result === 'swap-failed-slippage') {
        return 'slippage-failed';
    }
    else {
        assertNever(result);
    }
}

export async function sellPosition(position : Position, wallet : Wallet, env : Env, notificationChannel : UpdateableNotification, startTimeMS : number) : Promise<TransactionExecutionResult> {
    
    // create a signed tx (which will involve generating a quote)
    const swapTxSigner = new SwapTransactionSigner(wallet, env, notificationChannel);
    const signedTx = await swapTxSigner.createAndSign(position);
    if (signedTx == null) {
        logError("Could not generate signedTx on sell", position);
        await markAsOpen(position.positionID, position.token.address, position.vsToken.address, env);
        return 'tx-failed';
    }

    const connection = new Connection(env.RPC_ENDPOINT_URL);
    const txExecutor = new SwapExecutor(wallet, env, notificationChannel, connection, startTimeMS);
    const executionResult = await txExecutor.executeAndConfirmSignedTx(position, signedTx);
    return executionResult;
}