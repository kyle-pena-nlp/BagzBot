import { BaseUserDORequest } from "./base_user_do_request";

export interface ReactivatePositionRequest extends BaseUserDORequest {
    positionID : string
}

export interface ReactivatePositionResponse {
    success: boolean
}