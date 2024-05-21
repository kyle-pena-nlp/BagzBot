import { BaseUserDORequest } from "./base_user_do_request";

export interface RegisterPositionAsDeactivatedRequest extends BaseUserDORequest {
    positionID : string
    tokenAddress : string
    vsTokenAddress : string
}

export interface RegisterPositionAsDeactivatedResponse {
    success: boolean
}