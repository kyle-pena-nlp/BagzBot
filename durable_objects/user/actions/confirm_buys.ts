import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ConfirmBuysRequest extends BaseUserDORequest {
    positions : Position[]
}

export interface ConfirmBuysResponse {

}