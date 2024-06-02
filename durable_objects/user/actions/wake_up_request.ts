import { BaseUserDORequest } from "./base_user_do_request";

export interface WakeUpRequest extends BaseUserDORequest {

}

export interface WakeUpResponse {
    keepInWakeUpList : boolean
}