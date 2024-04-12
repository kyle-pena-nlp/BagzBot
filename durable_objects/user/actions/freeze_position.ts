import { BaseUserDORequest } from "./base_user_do_request";

export interface FreezePositionRequest extends BaseUserDORequest {
    positionID : string
}

export interface FreezePositionResponse {
    success : boolean
}
