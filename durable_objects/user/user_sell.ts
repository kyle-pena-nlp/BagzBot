import { Connection } from "@solana/web3.js";
import { Wallet, toUserAddress } from "../../crypto";
import { Env } from "../../env";
import { logError, logInfo } from "../../logging";
import { Position, PositionStatus } from "../../positions";
import { waitUntilCurrentBlockFinalized } from "../../rpc/rpc_blocks";
import { parseSwapTransaction } from "../../rpc/rpc_parse";
import { ParsedSuccessfulSwapSummary, UnknownTransactionParseSummary, isSuccessfullyParsedSwapSummary, isSwapExecutionErrorParseSummary, isSwapExecutionErrorParseSwapSummary, isUnknownTransactionParseSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
import { assertIs } from "../../util/enums";
import { getPosition, markAsClosed, markAsClosing, markAsOpen, removePosition, upsertPosition } from "../token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { createAndSignTx, executeAndConfirmSignedTx } from "./user_swap";

export async function sell(positionID: string, 
    tokenAddress : string,
    vsTokenAddress : string,
    wallet : Wallet, 
    env : Env) : Promise<void> {
    

    // if it doesn't exist, either:
    //  it's already been sold or... 
    //  the system determined that the tx certainly never executed.
    // early-out.


    const maybePosition = await prepareToSell(positionID, tokenAddress, vsTokenAddress, wallet, env);

    switch(maybePosition) {
        case 'error-fetching-position':
            return;
        case 'already-selling':
            return;
        case 'already-sold':
            return;
        case 'buy-never-occurred':
            await removePosition(positionID, tokenAddress, vsTokenAddress, env);
            return;
        case 'could-not-confirm-buy':
            // failure of confirmation occurs when services are down like RPC/jup
            // try to confirm again on next sell attempt.
            return;
        default:
            assertIs<Position,typeof maybePosition>();
    }

    const notificationChannel = TGStatusMessage.createAndSend('Initiating sell', false, maybePosition.chatID, env);

    const sellStatus = await sellPosition(maybePosition, wallet, env, notificationChannel);

    switch(sellStatus) {
        case 'already-selling':
            break;
        case 'already-sold':
            break;
        case 'could-not-confirm-sell':
            break;
        case 'sell-failed':
            break;
        case 'success':
            break;
        default:
            assertNever(sellStatus);
    }
}

async function prepareToSell(positionID : string,
    tokenAddress : string,
    vsTokenAddress : string,
    wallet : Wallet,
    env : Env) : Promise<'error-fetching-position'|'already-selling'|'already-sold'|'could-not-confirm-buy'|'buy-never-occurred'| Position> {
    
    // get the corresponding tracked position from the user-side position tracker
    const position : Position | undefined | 'error-fetching-position' = await getPosition(positionID, tokenAddress, vsTokenAddress, env).catch(r => {
        logError("Error fetching position", positionID, tokenAddress, vsTokenAddress);
        return 'error-fetching-position';
    });

    if (position === 'error-fetching-position') {
        return 'error-fetching-position';
    }

    if (position == null) {
        logInfo("Sell attempted on position that doesn't exist (already sold)", position);
        return 'already-sold';
    }

    // if the position is already being sold (Closing), don't double-attempt sell.
    if (position.status === PositionStatus.Closing) {
        logInfo("Sell attempted on position already closing", position);
        return 'already-selling';
    }

    // if position has already been sold, no further action needed.
    if (position.status === PositionStatus.Closed) {
        logInfo("Sell attempted on position already closed", position);
        return 'already-sold';
    }

    assertIs<PositionStatus.Open, typeof position.status>();

    const connection = new Connection(env.RPC_ENDPOINT_URL);

    // if the position was never successfully confirmed, try now.
    if (!position.confirmed) {
        logInfo("Position unconfirmed when attempting to sell - attempting to confirm now.", position);
        const confirmationResult = await tryToConfirmPriorBuyBeforeSelling(position, wallet, connection, env);
        // maybe do a final price check here to see if sell conditions are still met?
        // or... better yet... early out and let the tracker re-send if price cond'n met
        logError("Early-out of sell since tx was not confirmed... tracker will resend", position);
        if (confirmationResult === 'confirm-failed') {
            return 'could-not-confirm-buy';
        }
        else if (confirmationResult === 'swap-failed') {
            return 'buy-never-occurred';
        }
        else {
            assertIs<Position,typeof confirmationResult>();
            return position;
        }
    }
    else {
        return position;
    }
}

export async function sellPosition(position : Position, wallet : Wallet, env : Env, notificationChannel : UpdateableNotification) {
    
    // create a signed tx (which will involve generating a quote)
    const signedTx = await createAndSignTx(position, wallet, env, notificationChannel);
    if (signedTx == null) {
        logError("Could not generate signedTx on sell", position);
        await markAsOpen(position.positionID, position.token.address, position.vsToken.address, env);
        return 'sell-failed';
    }

    // check one last time position isn't gone, closed, or closing (awaits can happen, dude)
    const recheckPosition = await getPosition(position.positionID, position.token.address, position.vsToken.address, env);
    if (recheckPosition == null) {
        logInfo("Final check on position status showed position was closed/closing/removed");
        return 'already-sold';
    }
    else if (recheckPosition.status == PositionStatus.Closing) {
        return 'already-selling';
    }
    else if (recheckPosition.status === PositionStatus.Closed) {
        return 'already-sold';
    }

    assertIs<PositionStatus.Open,typeof recheckPosition.status>();

    // marking as closing will prevent double-sells until the sell is confirmed
    try {
        await markAsClosing(position.positionID, position.token.address, position.vsToken.address, env);
    }
    catch(e) {
        logError(`Could not mark as Closing`, position);
        return 'sell-failed';
    }

    const connection = new Connection(env.RPC_ENDPOINT_URL);

    // do the swap
    const parsedSwapSummary = await executeAndConfirmSignedTx(position, signedTx, wallet, env, notificationChannel, connection);

    try {
        if (parsedSwapSummary === 'could-not-retrieve-tx') {
            //TODO: mark as unconfirmed.
            //logError("Could not execute sell tx, marking position as open again", position);
            //userPositionTracker.setAsOpen(position.positionID);
            return 'could-not-confirm-sell';
        }
        else if (parsedSwapSummary === 'swap-failed') {
            logError("Could not execute sell tx, marking position as open again", position);
            await markAsOpen(position.positionID, position.token.address, position.vsToken.address, env);
            return 'sell-failed';
        }
        else if (parsedSwapSummary === 'tx-failed') {
            logError("Could not execute sell swap, marking position as open again", position);
            await markAsOpen(position.positionID, position.token.address, position.vsToken.address, env);
            return 'sell-failed';
        }
        else if (isSuccessfullyParsedSwapSummary(parsedSwapSummary)) {
            // otherwise, mark position as closed.
            await markAsClosed(position.positionID, position.token.address, position.vsToken.address, env);
            return 'success';
        }
        else {
            assertNever(parsedSwapSummary);
        }
    }
    finally {
        // force all queued message to fire
        await TGStatusMessage.finalize(notificationChannel);
    }
}

async function tryToConfirmPriorBuyBeforeSelling(position : Position, 
    wallet : Wallet, 
    connection : Connection,
    env : Env) : Promise<Position|'swap-failed'|'confirm-failed'> {
        
    // we are confirming the buy side, so the 'in' is the vsToken and the 'out' is the token
    const tryToGetSwapSummary = async () => await parseSwapTransaction(position.txSignature, 
        position.vsToken.address, 
        position.token.address, 
        toUserAddress(wallet), 
        connection, 
        env).catch(r => {
            logError(`Error parsing swap transaction`, position.txSignature);
            return null;
        });

    // try to get tx
    let maybeParsed = await tryToGetSwapSummary();

    if (maybeParsed == null) {
        return 'confirm-failed';
    }

    if (isSuccessfullyParsedSwapSummary(maybeParsed)) {
        // mark the position as confirmed and update the tracker, then early-out.
        position = confirmPositionWithParsedTxInfo(position, maybeParsed);
        await upsertPosition(position, env);
        return position;
    }
    else if (isSwapExecutionErrorParseSwapSummary(maybeParsed)) {
        // early-out.
        logError("Swap failed when checking tx for last-minute buy confirmation before sell", position);
        return 'swap-failed';
    }
    else if (isUnknownTransactionParseSummary(maybeParsed)) {
        // but if we are unconfirmed, wait a bit
        await waitUntilCurrentBlockFinalized(connection);
    }
    else {
        assertNever(maybeParsed);
    }

    assertIs<UnknownTransactionParseSummary,typeof maybeParsed>();
    
    // try again.
    maybeParsed = await tryToGetSwapSummary();

    if (maybeParsed == null) {
        return 'confirm-failed';
    }

    // if it still didn't work, it never will
    if (isUnknownTransactionParseSummary(maybeParsed)) {
        logError("Could not confirm existence of buy transaction before executing sell", position);
        return 'confirm-failed';
    }
    else if (isSwapExecutionErrorParseSummary(maybeParsed)) {
        logError("Swap failed when checking tx for last-minute buy confirmation before sell", position);
        return 'swap-failed';
    }

    assertIs<ParsedSuccessfulSwapSummary,typeof maybeParsed>();

    // we are successful.  mark the position as confirmed and update the tracker.
    confirmPositionWithParsedTxInfo(position, maybeParsed);

    const upsertResult = await upsertPosition(position, env).catch(r => {
        logError("Upsert position failed", position);
        return null;
    });

    if (upsertResult == null) {
        return 'confirm-failed';
    }

    return position;
}

function confirmPositionWithParsedTxInfo(position : Position, parsedSwapResult : ParsedSuccessfulSwapSummary) : Position {        
    const swapSummary = parsedSwapResult.swapSummary;
    position.vsTokenAmt = swapSummary.inTokenAmt;
    position.tokenAmt = swapSummary.outTokenAmt;       
    position.fillPrice = swapSummary.fillPrice;
    position.confirmed = true; // <----------
    return position;
}
