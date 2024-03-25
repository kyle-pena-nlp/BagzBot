import { BaseUserDORequest } from "./base_user_action";

export interface UserInitializeRequest  extends BaseUserDORequest {
	telegramUserName : string
};

export interface UserInitializeResponse {
};