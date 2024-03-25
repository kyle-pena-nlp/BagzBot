import { BaseUserAction } from "./base_user_action";

export interface UserInitializeRequest  extends BaseUserAction {
	telegramUserName : string
};

export interface UserInitializeResponse {
};