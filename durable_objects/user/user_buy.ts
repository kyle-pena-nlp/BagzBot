
import { Connection } from "@solana/web3.js";
import * as bs58 from "bs58";
import { Wallet } from "../../crypto";
import { dMult } from "../../decimalized";
import { Env } from "../../env";
import { logError, logInfo } from "../../logging";
import { MenuRetryBuy, MenuViewOpenPosition } from "../../menus";
import { Position, PositionRequest, PositionStatus, Quote, getSwapOfXDescription } from "../../positions";
import { SwapSummary, isSuccessfulSwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage, UpdateableNotification } from "../../telegram";
import { assertNever } from "../../util";
import { upsertPosition } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { createAndSignTx, executeAndConfirmSignedTx } from "./user_swap";

export async function buy(positionRequest : PositionRequest,
    wallet : Wallet,
    env : Env) : Promise<void> {

    // non-blocking notification channel to push update messages to TG
    const notificationChannel = TGStatusMessage.replaceWithNotification(positionRequest.messageID, `Initiating.`, false, positionRequest.chatID, env);
            
    const result = await _buy(positionRequest, wallet, notificationChannel, env);
    
    await TGStatusMessage.finalize(notificationChannel);

    if (result === 'can-retry') {
        // give user option to retry
        const retryBuyMenuRequest = new MenuRetryBuy(positionRequest).getUpdateExistingMenuRequest(positionRequest.chatID, positionRequest.messageID, env);
        await fetch(retryBuyMenuRequest);
    }
    else {
        // take straight to position view
        const newPosition = result.newPosition;
        const currentValue = dMult(newPosition.tokenAmt, newPosition.fillPrice);
        const viewOpenPositionMenuRequest = new MenuViewOpenPosition({
            position: newPosition,
            currentValue
        }).getUpdateExistingMenuRequest(positionRequest.chatID, positionRequest.messageID, env);
        await fetch(viewOpenPositionMenuRequest); 
    }
}

async function _buy(positionRequest: PositionRequest,
    wallet : Wallet, 
    notificationChannel : UpdateableNotification,
    env : Env) : Promise<'can-retry'|{ newPosition: Position }> {
    

    // RPC connection
    const connection = new Connection(env.RPC_ENDPOINT_URL);

    // create a signed tx (which involves generating a quote & etc.)
    const signedTx = await createAndSignTx(positionRequest, wallet, env, notificationChannel);
    
    // if failed to generate signedTx, early out.
    if (signedTx == null) {
        const swapOfX = getSwapOfXDescription(positionRequest);
        TGStatusMessage.queue(notificationChannel, `Unable to sign transaction for ${swapOfX}`, true);
        return 'can-retry';
    }

    // programatically generate bs58 signature of tx
    const signature = bs58.encode(signedTx.signatures[0]);
    
    // attempt to execute tx.  all sorts of things can go wrong.
    const parsedSwapSummary = await executeAndConfirmSignedTx(positionRequest, signedTx, wallet, env, notificationChannel, connection);

    let newPosition : Position|undefined = undefined;

    // if the tx was executed but the swap failed
    if (parsedSwapSummary === 'swap-failed') {
        logInfo("Swap failed", positionRequest);
    }
    // if the act of sending the tx itself failed
    else if (parsedSwapSummary === 'tx-failed') {
        logInfo("Tx failed", positionRequest);
    }
    // if we couldn't retrieve (and therefore confirm) the tx
    else if (parsedSwapSummary === 'could-not-retrieve-tx') {
        logError("Could not retrieve tx - converting to unconfirmed position", positionRequest);
        const quote = positionRequest.quote;
        newPosition = convertToUnconfirmedPosition(positionRequest, quote, signature);
        await upsertPosition(newPosition, env);
        TGStatusMessage.queue(notificationChannel, '', false);
    }
    else if (isSuccessfulSwapSummary(parsedSwapSummary)) {
        newPosition = convertConfirmedRequestToPosition(positionRequest, parsedSwapSummary.swapSummary);
        await upsertPosition(newPosition, env);
        TGStatusMessage.queue(notificationChannel, `Peak Price is now being tracked. Position will be unwound when price dips below ${positionRequest.triggerPercent}% of peak.`, false);
    }
    else {
        assertNever(parsedSwapSummary);
    }


    if (newPosition == null) {
        return 'can-retry';
    }
    else if (newPosition != null) {
        return  { newPosition };
    }
    else {
        assertNever(newPosition);
    }
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