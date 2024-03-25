import { BaseUserAction } from "./base_user_action";

export interface GetImpersonatedUserIDRequest  extends BaseUserAction {

}

export interface GetImpersonatedUserIDResponse {
	impersonatedUserID : number|undefined
}