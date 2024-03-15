import { TokenInfo } from "../../../tokens/token_info";

export interface DefaultTrailingStopLossRequestRequest {
	userID : number,
	chatID: number,
	messageID : number,
	token : TokenInfo
}