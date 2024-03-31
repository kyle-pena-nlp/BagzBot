import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ConfirmSellsRequest extends BaseUserDORequest {
    positions : Position[]
}

export interface ConfirmSellsResponse {
    
}