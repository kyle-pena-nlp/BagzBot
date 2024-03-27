import { Connection } from "@solana/web3.js";
import { Wallet, toUserAddress } from "../../crypto";
import { Env } from "../../env";
import { logError, logInfo } from "../../logging";
import { Position, PositionStatus } from "../../positions";
import { waitUntilCurrentBlockFinalized } from "../../rpc/rpc_blocks";
import { parseSwapTransaction } from "../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary, isSwapExecutionErrorParseSummary, isSwapExecutionErrorParseSwapSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage } from "../../telegram";
import { assertNever } from "../../util";
import { getPosition, markAsClosed, markAsClosing, markAsOpen, upsertPosition } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { createAndSignTx, executeAndConfirmSignedTx } from "./user_swap";

export async function sell(positionID: string, 
    tokenAddress : string,
    vsTokenAddress : string,
    wallet : Wallet, 
    env : Env) : Promise<void> {

    // get the corresponding tracked position from the user-side position tracker
    const position = await getPosition(positionID, tokenAddress, vsTokenAddress, env);

    // if it doesn't exist, either:
    //  it's already been sold or... 
    //  the system determined that the tx certainly never executed.
    // early-out.
    if (position == null) {
        logInfo("Sell attempted on position that doesn't exist", position);
        return;
    }

    return await sellPosition(position, wallet, env);

}
export async function sellPosition(position : Position,
    wallet : Wallet,
    env : Env) : Promise<void> {



    // if the position is already being sold (Closing), don't pile it on.
    if (position.status === PositionStatus.Closing) {
        logInfo("Sell attempted on position already closing", position);
        return;
    }

    // if position has already been sold, no further action needed.
    if (position.status === PositionStatus.Closed) {
        logInfo("Sell attempted on position already closed", position);
        return;
    }

    const connection = new Connection(env.RPC_ENDPOINT_URL);

    // if the position was never successfully confirmed, try now.
    if (!position.confirmed) {
        logInfo("Position unconfirmed when attempting to sell - attempting to confirm now.", position);
        await tryToConfirmPriorBuyInOrderToSell(position, wallet, connection, env);
        // maybe do a final price check here to see if sell conditions are still met?
        // or... better yet... early out and let the tracker re-send if price cond'n met
        logError("Early-out of sell since tx was not confirmed... tracker will resend", position);
        return;
    }

    // set up a status channel in the chat.
    const notificationChannel = TGStatusMessage.createAndSend(`Auto-Sell conditions met! Initiating sell of ${position.token.symbol} position!`, false, position.chatID, env);

    // create a signed tx (which will involve generating a quote)
    const signedTx = await createAndSignTx(position, wallet, env, notificationChannel);
    if (signedTx == null) {
        logError("Could not generate signedTx on sell", position);
        return;
    }

    // check one last time position isn't gone, closed, or closing (awaits can happen, dude)
    const recheckPosition = await getPosition(position.positionID, position.token.address, position.vsToken.address, env);
    if (recheckPosition == null || recheckPosition.status == PositionStatus.Closing || recheckPosition.status === PositionStatus.Closed) {
        logInfo("Final check on position status showed position was closed/closing/removed");
        return;
    }

    // marking as closing will prevent double-sells until the sell is confirmed
    await markAsClosing(position.positionID, position.token.address, position.vsToken.address, env);

    // TODO: how can I prevent an extra sell attempt from sneaking between these lines of code? is there a way to block?

    // do the swap
    const parsedSwapSummary = await executeAndConfirmSignedTx(position, signedTx, wallet, env, notificationChannel, connection);

    if (parsedSwapSummary === 'could-not-retrieve-tx') {
        //TODO: mark as unconfirmed.
        //logError("Could not execute sell tx, marking position as open again", position);
        //userPositionTracker.setAsOpen(position.positionID);
        return;
    }
    else if (parsedSwapSummary === 'swap-failed') {
        logError("Could not execute sell tx, marking position as open again", position);
        await markAsOpen(position.positionID, position.token.address, position.vsToken.address, env);
    }
    else if (parsedSwapSummary === 'tx-failed') {
        logError("Could not execute sell swap, marking position as open again", position);
        await markAsOpen(position.positionID, position.token.address, position.vsToken.address, env);
    }
    else if (isSuccessfullyParsedSwapSummary(parsedSwapSummary)) {
        // otherwise, mark position as closed.
        await markAsClosed(position.positionID, position.token.address, position.vsToken.address, env);
    }
    else {
        assertNever(parsedSwapSummary);
    }

    // force all queued message to fire
    await TGStatusMessage.finalize(notificationChannel);
}

async function tryToConfirmPriorBuyInOrderToSell(position : Position, 
    wallet : Wallet, 
    connection : Connection,
    env : Env) : Promise<ParsedSuccessfulSwapSummary|undefined> {
        
    // we are confirming the buy side, so the 'in' is the vsToken and the 'out' is the token
    const tryToGetSwapSummary = async () => await parseSwapTransaction(position.txSignature, 
        position.vsToken.address, 
        position.token.address, 
        toUserAddress(wallet), 
        connection, 
        env);

    // try to get tx
    let maybeParsed = await tryToGetSwapSummary();

    // if that worked, we're good
    if (isSuccessfullyParsedSwapSummary(maybeParsed)) {
        // mark the position as confirmed and update the tracker
        updatePositionWithParsedTxInfo(position, maybeParsed);
        await upsertPosition(position, env);
        return maybeParsed;
    }

    // if the tx executed but the swap failed, early-out
    if (isSwapExecutionErrorParseSwapSummary(maybeParsed)) {
        logError("Swap failed when checking tx for last-minute buy confirmation before sell", position);
        return;
    }

    // but if we are unconfirmed, wait a bit
    await waitUntilCurrentBlockFinalized(connection, env);
    
    // try again.
    maybeParsed = await tryToGetSwapSummary();

    // if it still didn't work, it never will
    if (isUnknownTransactionParseSummary(maybeParsed)) {
        logError("Could not confirm existence of buy transaction before executing sell", position);
        return;
    }

    // if it still didn't work, it never will
    if (isSwapExecutionErrorParseSummary(maybeParsed)) {
        logError("Swap failed when checking tx for last-minute buy confirmation before sell", position);
        return;
    }

    // we are successful.  mark the position as confirmed and update the tracker.
    updatePositionWithParsedTxInfo(position, maybeParsed);
    await upsertPosition(position, env);
    return maybeParsed;
}

function updatePositionWithParsedTxInfo(position : Position, parsedSwapResult : ParsedSuccessfulSwapSummary) {        
    const swapSummary = parsedSwapResult.swapSummary;
    position.confirmed = true;
    position.vsTokenAmt = swapSummary.inTokenAmt;
    position.tokenAmt = swapSummary.outTokenAmt;       
    position.fillPrice = swapSummary.fillPrice;
}
