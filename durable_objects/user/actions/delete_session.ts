import { BaseUserDORequest } from "./base_user_do_request";

export interface DeleteSessionRequest extends BaseUserDORequest {
	messageID : number
};

export interface DeleteSessionResponse {
	
}