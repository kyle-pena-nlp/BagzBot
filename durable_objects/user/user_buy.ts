
import { Connection } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Wallet } from "../../crypto";
import { Env } from "../../env";
import { Position, PositionRequest, PositionStatus, Quote, getSwapOfXDescription } from "../../positions";
import { SwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage } from "../../telegram";
import { importNewPosition as importNewPositionIntoPriceTracker } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { createAndSignTx, executeAndConfirmSignedTx } from "./user_swap";
/* markPositionAsOpen, renegeOpenPosition */

export async function buy(positionRequest: PositionRequest,
    wallet : Wallet, 
    userPositionTracker: UserPositionTracker, 
    env : Env) {

    const connection = new Connection(env.RPC_ENDPOINT_URL);
    const quote = positionRequest.quote;
    const notificationChannel = TGStatusMessage.replaceWithNotification(positionRequest.messageID, `Initiating.`, false, positionRequest.chatID, env);
    
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
    // by optimistic, "assume" the tx and swap executed successfully
    // If unconfirmed, we will attempt to confirm at sell time
    // TODO: periodically scan for unconfirmed and attempt confirmation.
    userPositionTracker.storePositions([convertToUnconfirmedPosition(positionRequest, quote, signature)]);
    
    const parsedSwapSummary = await executeAndConfirmSignedTx(positionRequest, signedTx, wallet, env, notificationChannel, connection);
    if (parsedSwapSummary) {
        const newPosition = convertConfirmedRequestToPosition(positionRequest, parsedSwapSummary.swapSummary);
        userPositionTracker.storePositions([newPosition]);
        await importNewPositionIntoPriceTracker(newPosition, env);
        TGStatusMessage.queue(notificationChannel, `Peak Price is now being tracked. Position will be unwound when price dips below ${positionRequest.triggerPercent}% of peak.`, true);    
    }
    else {
        // buy failed, remove position from user tracking.
        userPositionTracker.removePositions([positionRequest.positionID]);
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