import { BaseUserDORequest } from "./base_user_action";

export interface GetUserDataRequest extends BaseUserDORequest {
	messageID : number
	forceRefreshBalance: boolean
};


