import { BaseUserDORequest } from "./base_user_do_request";

export interface DeactivatePositionRequest extends BaseUserDORequest {
    positionID : string
}

export interface DeactivatePositionResponse {
    success : boolean
}
