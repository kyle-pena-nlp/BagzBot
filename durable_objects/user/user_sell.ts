import { Connection } from "@solana/web3.js";
import { Wallet } from "../../crypto";
import { asTokenPrice } from "../../decimalized/decimalized_amount";
import { Env, getRPCUrl } from "../../env";
import { logError } from "../../logging";
import { MenuRetryManualSell } from "../../menus";
import { Position } from "../../positions";
import { ParsedSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
import { markAsOpen } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { SwapExecutor } from "./swap_executor";
import { SwapTransactionSigner } from "./swap_transaction_signer";


export type SellResult = 'tx-failed'|'failed'|'slippage-failed'|'unconfirmed'|'confirmed'

export async function sell(position: Position, 
    type : 'Sell'|'Auto-sell',
    wallet : Wallet, 
    env : Env,
    notificationChannel : UpdateableNotification,
    startTimeMS : number) : Promise<SellResult> {

    const swapExecutionResult = await sellPosition(position, wallet, env, notificationChannel, startTimeMS);

    if (swapExecutionResult === 'tx-failed') {

        // if we couldn't even create a tx, then mark the position as open again
        // (price tracking will fire it off again if need be)
        await markAsOpen(position.positionID, 
            position.token.address, 
            position.vsToken.address, env);

        return swapExecutionResult;
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

        return updatedStatusOfSell;
    }
}

export async function publishFinalSellMessage(position : Position, type : 'Sell'|'Auto-sell', status : SellResult, chatID : number, channel : UpdateableNotification, env : Env) {
    const finalSellMessage = getFinalSellMessage(position, type, status);
    TGStatusMessage.queue(channel, finalSellMessage, true);
    await TGStatusMessage.finalize(channel);
    if (type === 'Sell' && (status !== 'confirmed' && status !== 'unconfirmed')) {
        const requestSellDialogueRequest = new MenuRetryManualSell({ status: status, positionID : position.positionID }).getCreateNewMenuRequest(chatID, env);
        await fetch(requestSellDialogueRequest);
    }
}

function getFinalSellMessage(position : Position, type : 'Sell'|'Auto-sell', status : SellResult) : string {
    const Sale = type;
    const symbol = `$${position.token.symbol}`;
    const amount = asTokenPrice(position.tokenAmt);
    const maybeRetry = type === 'Auto-sell' ? 'Sale will be retried automatically.' : '';
    const maybeRetrySlippage = type === 'Auto-sell' ? getAutoSellSlippageRetryMessage(position) : '';
    switch(status) {
        case 'tx-failed':
            return `${Sale} of ${amount} ${symbol} failed. ${maybeRetry}`;
        case 'confirmed':
            return `${Sale} of ${amount} ${symbol} successful!`;;
        case 'failed':
            return `${Sale} of ${amount} ${symbol} failed. ${maybeRetry}`;
        case 'slippage-failed':
            return `${Sale} of ${amount} ${symbol} failed due to slippage. ${maybeRetrySlippage}`;
        case 'unconfirmed':
            return `${Sale} of ${amount} ${symbol} could not be confirmed due to network congestion.  We will retry confirmation soon.`;
        default:
            assertNever(status);
    }
}

function getAutoSellSlippageRetryMessage(position : Position) {

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

    const connection = new Connection(getRPCUrl(env));
    const txExecutor = new SwapExecutor(wallet, env, notificationChannel, connection, startTimeMS);
    const executionResult = await txExecutor.executeTxAndParseResult(position, signedTx);
    return executionResult;
}