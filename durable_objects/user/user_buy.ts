
import { Connection } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Wallet } from "../../crypto";
import { Env } from "../../env";
import { Position, PositionRequest, PositionStatus, Quote, getSwapOfXDescription } from "../../positions";
import { SwapSummary, isSuccessfulSwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage } from "../../telegram";
import { assertNever } from "../../util";
import { importNewPosition as importNewPositionIntoPriceTracker } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { createAndSignTx, executeAndConfirmSignedTx } from "./user_swap";
/* markPositionAsOpen, renegeOpenPosition */




export async function buy(positionRequest: PositionRequest,
    wallet : Wallet, 
    env : Env) {

    // durable objects only continue to process requests for up to 30s.
    const startTimeMS = Date.now();
    const maxTimeMS = startTimeMS + (25 * 1000); // actual limit is 30s. Give some breathing room.

    // non-blocking notification channel to push update messages to TG
    const notificationChannel = TGStatusMessage.replaceWithNotification(positionRequest.messageID, `Initiating.`, false, positionRequest.chatID, env);
    
    // RPC connection
    const connection = new Connection(env.RPC_ENDPOINT_URL);

    // create a signed tx (which involves generating a quote & etc.)
    const signedTx = await createAndSignTx(positionRequest, wallet, env, notificationChannel);
    
    // if failed to generate signedTx, early out.
    if (signedTx == null) {
        const swapOfX = getSwapOfXDescription(positionRequest);
        TGStatusMessage.queue(notificationChannel, `Unable to sign transaction for ${swapOfX}`, true);
        return;
    }

    // programatically generate bs58 signature of tx
    const signature = bs58.encode(signedTx.signatures[0]);

    // optimistically store the position in the user-side tracker
    // by optimistic, "assume" the tx and swap will execute successfully
    // If unconfirmed, we will attempt to confirm at sell time
    // TODO: periodically scan for unconfirmed and attempt confirmation.
    const quote = positionRequest.quote;
    await storePosition(convertToUnconfirmedPosition(positionRequest, quote, signature), env);
    
    // attempt to execute tx.  all sorts of things can go wrong.
    const parsedSwapSummary = await executeAndConfirmSignedTx(positionRequest, signedTx, wallet, env, notificationChannel, connection, maxTimeMS);

    // if we sent the tx at least once, but couldn't retrieve it (i.e.; couldn't confirm it)
    if (parsedSwapSummary === 'could-not-retrieve-tx') {
        const unconfirmedPosition = convertToUnconfirmedPosition(positionRequest, quote, signature);
        await storePosition(unconfirmedPosition, env);
        // TODO: link to view position menu
    }
    // if we sent the tx and it executed, but the swap failed
    else if (parsedSwapSummary === 'swap-failed') {
        await removePosition(positionRequest.positionID, env);
    }
    // if the act of sending the tx itself failed
    else if (parsedSwapSummary === 'tx-failed') {
        await removePosition(positionRequest.positionID, env);
    }
    // but if it's successful, convert it to a confirmed position and celebrate!
    else if (isSuccessfulSwapSummary(parsedSwapSummary)) {
        const newPosition = convertConfirmedRequestToPosition(positionRequest, parsedSwapSummary.swapSummary);
        await storePosition(newPosition, env);
        await importNewPositionIntoPriceTracker(newPosition, env);
        TGStatusMessage.queue(notificationChannel, `Peak Price is now being tracked. Position will be unwound when price dips below ${positionRequest.triggerPercent}% of peak.`, true);    
        // TODO: link to view position menu
    }
    else {
        assertNever(parsedSwapSummary);
    }
    await TGStatusMessage.finalize(notificationChannel);
}

function convertToUnconfirmedPosition(positionRequest : PositionRequest, quote : Quote, txSignature : string) {
    const position : Position = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        type: positionRequest.positionType,
        status: PositionStatus.Open,
        confirmed: false, // <----------
        txSignature: txSignature,
        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        vsTokenAmt : quote.inTokenAmt,
        tokenAmt: quote.outTokenAmt,
        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        retrySellIfSlippageExceeded : positionRequest.retrySellIfSlippageExceeded,
        fillPrice: quote.fillPrice // this may not be the final quote on buy, but it is likely close
    };
    return position;
}

function convertConfirmedRequestToPosition(positionRequest: PositionRequest, swapSummary : SwapSummary) : Position {
    const position : Position = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        type: positionRequest.positionType,
        status: PositionStatus.Open,
        confirmed: true, // <-------------
        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        retrySellIfSlippageExceeded : positionRequest.retrySellIfSlippageExceeded,
        txSignature: swapSummary.txSignature,      
        vsTokenAmt : swapSummary.inTokenAmt,
        tokenAmt: swapSummary.outTokenAmt,        
        fillPrice: swapSummary.fillPrice
    };
    return position;
}