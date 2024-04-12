import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetFrozenPositionRequest extends BaseUserDORequest {
    positionID : string
}

export interface GetFrozenPositionResponse {
    frozenPosition : Position|undefined
}