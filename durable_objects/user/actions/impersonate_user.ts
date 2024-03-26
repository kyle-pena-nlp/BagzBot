import { BaseUserDORequest } from "./base_user_do_request";

export interface ImpersonateUserRequest extends BaseUserDORequest {
    userIDToImpersonate : number
}

export interface ImpersonateUserResponse {
}