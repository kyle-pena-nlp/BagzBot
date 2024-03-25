import { BaseUserAction } from "./base_user_action";

export interface DeleteSessionRequest extends BaseUserAction {
	messageID : number
};

export interface DeleteSessionResponse {
	
}