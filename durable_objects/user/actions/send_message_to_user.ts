import { BaseUserDORequest } from "./base_user_do_request";

export interface SendMessageToUserRequest extends BaseUserDORequest {
    message : string
}

export interface SendMessageToUserResponse {

}