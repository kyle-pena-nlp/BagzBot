import { BaseUserDORequest } from "./base_user_do_request";

export interface RegisterPositionAsClosedRequest extends BaseUserDORequest {
    positionID : string
    tokenAddress : string
    vsTokenAddress : string
}

export interface RegisterPositionAsClosedResponse {
    success: boolean
}