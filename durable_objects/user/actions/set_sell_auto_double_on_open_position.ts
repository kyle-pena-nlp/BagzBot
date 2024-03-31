import { BaseUserDORequest } from "./base_user_do_request";

export interface SetSellAutoDoubleOnOpenPositionRequest extends BaseUserDORequest {
    positionID : string
    choice : boolean
}

export interface SetSellAutoDoubleOnOpenPositionResponse {
}