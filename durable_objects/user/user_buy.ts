
import { Connection } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Wallet } from "../../crypto";
import { Env } from "../../env";
import { Position, PositionRequest, PositionStatus, Quote, getSwapOfXDescription } from "../../positions";
import { SwapSummary, isSuccessfulSwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage } from "../../telegram";
import { assertNever } from "../../util";
import { upsertPosition } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { createAndSignTx, executeAndConfirmSignedTx } from "./user_swap";
import { logInfo } from "../../logging";

export async function buy(positionRequest: PositionRequest,
    wallet : Wallet, 
    env : Env) {
    
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
    //
    //await upsertPosition(convertToUnconfirmedPosition(positionRequest, quote, signature), env);
    
    // attempt to execute tx.  all sorts of things can go wrong.
    const parsedSwapSummary = await executeAndConfirmSignedTx(positionRequest, signedTx, wallet, env, notificationChannel, connection);

    // if we couldn't confirm, send the position for tracking, but marked as unconfirmed.
    if (parsedSwapSummary === 'could-not-retrieve-tx') {
        const quote = positionRequest.quote;
        const unconfirmedPosition = convertToUnconfirmedPosition(positionRequest, quote, signature);
        await upsertPosition(unconfirmedPosition, env);
    }
    // if we sent the tx and it executed, but the swap failed
    else if (parsedSwapSummary === 'swap-failed') {
        logInfo("Swap failed", positionRequest);
    }
    // if the act of sending the tx itself failed
    else if (parsedSwapSummary === 'tx-failed') {
        logInfo("Tx failed", positionRequest);
    }
    // but if it's successful, convert it to a confirmed position and send it to the tracker!
    else if (isSuccessfulSwapSummary(parsedSwapSummary)) {
        const newPosition = convertConfirmedRequestToPosition(positionRequest, parsedSwapSummary.swapSummary);
        await upsertPosition(newPosition, env);
        TGStatusMessage.queue(notificationChannel, `Peak Price is now being tracked. Position will be unwound when price dips below ${positionRequest.triggerPercent}% of peak.`, true);    
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