import { BaseUserDORequest } from "./base_user_do_request";

export interface ConfirmBuysRequest extends BaseUserDORequest {
    positionIDs : string[]
}

export interface ConfirmBuysResponse {

}