import { BaseUserAction } from "./base_user_action";

export interface GetUserDataRequest extends BaseUserAction {
	messageID : number
	forceRefreshBalance: boolean
};


