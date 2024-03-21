import { PositionPreRequest } from "../../../positions";
import { TokenInfo } from "../../../tokens";

export interface DefaultTrailingStopLossRequestRequest {
	userID : number,
	chatID: number,
	messageID : number,
	token : TokenInfo
}

export interface DefaultTrailingStopLossRequestResponse {
	prerequest : PositionPreRequest
}