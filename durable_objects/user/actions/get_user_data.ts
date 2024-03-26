import { BaseUserDORequest } from "./base_user_do_request";

export interface GetUserDataRequest extends BaseUserDORequest {
	messageID : number
	forceRefreshBalance: boolean
};


