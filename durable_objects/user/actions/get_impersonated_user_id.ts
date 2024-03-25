import { BaseUserDORequest } from "./base_user_action";

export interface GetImpersonatedUserIDRequest  extends BaseUserDORequest {

}

export interface GetImpersonatedUserIDResponse {
	impersonatedUserID : number|undefined
}