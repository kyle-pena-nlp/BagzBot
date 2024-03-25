import { BaseUserDORequest } from "./base_user_action";

export interface DeleteSessionRequest extends BaseUserDORequest {
	messageID : number
};

export interface DeleteSessionResponse {
	
}