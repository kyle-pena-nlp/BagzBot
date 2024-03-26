import { BaseUserDORequest } from "./base_user_do_request";

export interface UserInitializeRequest  extends BaseUserDORequest {
	telegramUserName : string
};

export interface UserInitializeResponse {
};