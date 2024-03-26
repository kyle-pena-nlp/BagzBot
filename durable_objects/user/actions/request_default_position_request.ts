import { PositionPreRequest } from "../../../positions";
import { TokenInfo } from "../../../tokens";
import { BaseUserDORequest } from "./base_user_do_request";

export interface DefaultTrailingStopLossRequestRequest  extends BaseUserDORequest {
	telegramUserID : number,
	chatID: number,
	messageID : number,
	token ?: TokenInfo
}

export interface DefaultTrailingStopLossRequestResponse {
	prerequest : PositionPreRequest
}