import { BaseUserDORequest } from "./base_user_do_request";

export interface UnfreezePositionRequest extends BaseUserDORequest {
    positionID : string
}

export interface UnfreezePositionResponse {
    success: boolean
}