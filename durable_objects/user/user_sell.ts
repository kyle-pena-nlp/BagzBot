import { Connection } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { Env } from "../../env";
import { logError } from "../../logging";
import { Position } from "../../positions";
import { isSuccessfullyParsedSwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { markAsOpen, updateSellConfirmationStatus } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapTransactionSigner } from "./swap_transaction_signer";
import { TransactionExecutor } from "./user_swap";

export type SellStatus = 'failed'|'slippage-failed'|'unconfirmed'|'confirmed';

export async function sell(position: Position, 
    wallet : Wallet, 
    env : Env,
    startTimeMS : number) : Promise<void> {

    const notificationChannel = TGStatusMessage.createAndSend('Initiating sell', false, position.chatID, env);

    const sellStatus = await sellPosition(position, wallet, env, notificationChannel, startTimeMS);

    await updateSellConfirmationStatus(position.positionID, 
        position.token.address, 
        position.vsToken.address, 
        sellStatus, 
        env);
}

export async function sellPosition(position : Position, wallet : Wallet, env : Env, notificationChannel : UpdateableNotification, startTimeMS : number) : Promise<SellStatus> {
    
    // create a signed tx (which will involve generating a quote)
    const swapTxSigner = new SwapTransactionSigner(wallet, env, notificationChannel);
    const signedTx = await swapTxSigner.createAndSign(position);
    if (signedTx == null) {
        logError("Could not generate signedTx on sell", position);
        await markAsOpen(position.positionID, position.token.address, position.vsToken.address, env);
        return 'failed';
    }

    const connection = new Connection(env.RPC_ENDPOINT_URL);

    // do the swap
    const txExecutor = new TransactionExecutor(wallet, env, notificationChannel, connection, startTimeMS);
    const parsedSwapSummary = await txExecutor.executeAndConfirmSignedTx(position, signedTx);

    if (parsedSwapSummary === 'could-not-confirm') {
        return 'unconfirmed';
    }
    else if (parsedSwapSummary === 'swap-failed') {
        return 'failed';
    }
    else if (parsedSwapSummary === 'tx-failed') {
        return 'failed';
    }
    else if (parsedSwapSummary === 'swap-failed-slippage') {
        return 'slippage-failed';
    }
    if (isSuccessfullyParsedSwapSummary(parsedSwapSummary)) {
        return 'confirmed';
    }
    else {
        return parsedSwapSummary;
    }
}