
import { Wallet } from "../../crypto";
import { Env } from "../../env";
import { Position, PositionRequest, PositionStatus } from "../../positions";
import { SwapSummary } from "../../rpc/rpc_types";
import { TGStatusMessage } from "../../telegram";
import { importNewPosition as importNewPositionIntoPriceTracker } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { swap } from "./user_swap";
/* markPositionAsOpen, renegeOpenPosition */

export async function buy(positionRequest: PositionRequest, 
    wallet : Wallet, 
    userPositionTracker: UserPositionTracker, 
    env : Env) {

    const notificationChannel = TGStatusMessage.replaceWithNotification(positionRequest.messageID, `Initiating.`, false, positionRequest.chatID, env);
    
    const parsedSwapSummary = await swap(positionRequest, wallet, env, notificationChannel);
    if (parsedSwapSummary) {
        const newPosition = convertToPosition(positionRequest, parsedSwapSummary.swapSummary);
        userPositionTracker.storePositions([newPosition]);
        await importNewPositionIntoPriceTracker(newPosition, env);
        TGStatusMessage.queue(notificationChannel, `Peak Price is now being tracked. Position will be unwound when price dips below ${positionRequest.triggerPercent}% of peak.`, true);    
    }

    await TGStatusMessage.finalize(notificationChannel);
}

function convertToPosition(positionRequest: PositionRequest, swapSummary : SwapSummary) : Position {
    const position : Position = {
        userID: positionRequest.userID,
        chatID : positionRequest.chatID,
        messageID : positionRequest.messageID,
        positionID : positionRequest.positionID,
        type: positionRequest.positionType,
        status: PositionStatus.Open,
        token: positionRequest.token,
        vsToken: positionRequest.vsToken,
        vsTokenAmt : swapSummary.inTokenAmt,
        tokenAmt: swapSummary.outTokenAmt,
        sellSlippagePercent: positionRequest.slippagePercent,
        triggerPercent : positionRequest.triggerPercent,
        retrySellIfSlippageExceeded : positionRequest.retrySellIfSlippageExceeded,
        fillPrice: swapSummary.fillPrice
    };
    return position;
}