import { Connection } from "@solana/web3.js";
import { Wallet, toUserAddress } from "../../crypto";
import { Env } from "../../env";
import { logError, logInfo } from "../../logging";
import { Position, PositionStatus } from "../../positions";
import { waitUntilCurrentBlockFinalized } from "../../rpc/rpc_blocks";
import { parseSwapTransaction } from "../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, isSuccessfullyParsedSwapSummary, isSwapExecutionErrorParseSummary, isSwapExecutionErrorParseSwapSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage } from "../../telegram";
import { MarkPositionAsClosedRequest } from "../token_pair_position_tracker/actions/mark_position_as_closed";
import { markPositionAsClosedInTokenPairPositionTracker as removePositionFromPriceTracking } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { createAndSignTx, executeAndConfirmSignedTx } from "./user_swap";

export async function sell(positionID: string, 
    wallet : Wallet, 
    userPositionTracker : UserPositionTracker,
    env : Env) {

    // get the corresponding tracked position from the user-side position tracker
    const position = userPositionTracker.getPosition(positionID);
    
    // if it doesn't exist, either:
    //  it's already been sold or... 
    //  the system determined that the tx certainly never executed.
    // early-out.
    if (position == null) {
        logInfo("Sell attempted on position that doesn't exist", position);
        return;
    }

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
        await tryToConfirmPriorBuyInOrderToSell(position, wallet, connection, userPositionTracker, env);
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
    const recheckPosition = userPositionTracker.getPosition(position.positionID);
    if (recheckPosition == null || recheckPosition.status == PositionStatus.Closing || recheckPosition.status === PositionStatus.Closed) {
        logInfo("Final check on position status showed position was closed/closing/removed");
        return;
    }

    // marking as closing will prevent double-sells until the sell is confirmed
    userPositionTracker.markAsClosing(position.positionID);

    // TODO: how can I prevent an extra sell attempt from sneaking between these lines of code? is there a way to block?

    // do the swap
    const parsedSwapSummary = await executeAndConfirmSignedTx(position, signedTx, wallet, env, notificationChannel, connection);

    // if the sell swap failed, set the position as open again (todo: don't retry if not desired.)
    if (parsedSwapSummary == null) {
        logError("Could not execute sell tx, marking position as open again", position);
        userPositionTracker.setAsOpen(position.positionID);
        return;
    }

    // otherwise, mark position as closed.
    userPositionTracker.closePosition(position.positionID);

    // send a request to the price tracker to stop tracking the position
    const removeFromPriceTrackingRequest : MarkPositionAsClosedRequest = { 
        positionID : position.positionID, 
        tokenAddress: position.token.address, 
        vsTokenAddress : position.vsToken.address 
    };
    await removePositionFromPriceTracking(removeFromPriceTrackingRequest, env);

    // force all queued message to fire
    await TGStatusMessage.finalize(notificationChannel);
}

async function tryToConfirmPriorBuyInOrderToSell(position : Position, 
    wallet : Wallet, 
    connection : Connection,
    userPositionTracker : UserPositionTracker, 
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
        userPositionTracker.storePositions([position]);
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
    userPositionTracker.storePositions([position]);
    return maybeParsed;
}

function updatePositionWithParsedTxInfo(position : Position, parsedSwapResult : ParsedSuccessfulSwapSummary) {        
    const swapSummary = parsedSwapResult.swapSummary;
    position.confirmed = true;
    position.vsTokenAmt = swapSummary.inTokenAmt;
    position.tokenAmt = swapSummary.outTokenAmt;       
    position.fillPrice = swapSummary.fillPrice;
}
