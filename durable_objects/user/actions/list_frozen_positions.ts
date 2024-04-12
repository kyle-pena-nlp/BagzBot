import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ListDeactivatedPositionsRequest extends BaseUserDORequest {

}

export interface ListDeactivatedPositionsResponse {
    deactivatedPositions : Position[]
}