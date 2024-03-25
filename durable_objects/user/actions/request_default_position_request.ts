import { PositionPreRequest } from "../../../positions";
import { TokenInfo } from "../../../tokens";
import { BaseUserAction } from "./base_user_action";

export interface DefaultTrailingStopLossRequestRequest  extends BaseUserAction {
	telegramUserID : number,
	chatID: number,
	messageID : number,
	token ?: TokenInfo
}

export interface DefaultTrailingStopLossRequestResponse {
	prerequest : PositionPreRequest
}