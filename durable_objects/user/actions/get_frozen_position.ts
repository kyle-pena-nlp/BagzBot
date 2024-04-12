import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetDeactivatedPositionRequest extends BaseUserDORequest {
    positionID : string
}

export interface GetDeactivatedPositionResponse {
    deactivatedPosition : Position|undefined
}