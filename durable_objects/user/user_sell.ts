import { Wallet } from "../../crypto/wallet";
import { Env } from "../../env";
import { Position } from "../../positions/positions";
import { TGStatusMessage } from "../../telegram/telegram_status_message";
import { UserPositionTracker } from "./trackers/user_position_tracker";
import { swap } from "./user_swap";
import { markPositionAsClosedInTokenPairPositionTracker as removePositionFromPriceTracking } from "../token_pair_position_tracker/token_pair_position_tracker_DO_interop";
import { MarkPositionAsClosedRequest } from "../token_pair_position_tracker/actions/mark_position_as_closed";

export async function sell(position: Position, 
    wallet : Wallet, 
    userPositionTracker : UserPositionTracker,
    env : Env) {

    userPositionTracker.setAsClosing(position.positionID);

    const notificationChannel = TGStatusMessage.createAndSend(`Initiating swap.`, false, position.chatID, env);

    const parsedSwapSummary = await swap(position, wallet, env, notificationChannel);
    if (!parsedSwapSummary) {
        userPositionTracker.setAsOpen(position.positionID);
        return;
    }

    userPositionTracker.closePosition(position.positionID);

    const removeFromPriceTrackingRequest : MarkPositionAsClosedRequest = { 
        positionID : position.positionID, 
        tokenAddress: position.token.address, 
        vsTokenAddress : position.vsToken.address 
    };
    
    await removePositionFromPriceTracking(removeFromPriceTrackingRequest, env);

    await TGStatusMessage.finalize(notificationChannel);
}