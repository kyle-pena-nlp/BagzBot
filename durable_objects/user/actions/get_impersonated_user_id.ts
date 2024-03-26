import { BaseUserDORequest } from "./base_user_do_request";

export interface GetImpersonatedUserIDRequest  extends BaseUserDORequest {

}

export interface GetImpersonatedUserIDResponse {
	impersonatedUserID : number|null
}