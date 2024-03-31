import { BaseUserDORequest } from "./base_user_do_request";

export interface ConfirmSellsRequest extends BaseUserDORequest {
    positionIDs : string[]
}

export interface ConfirmSellsResponse {
    
}