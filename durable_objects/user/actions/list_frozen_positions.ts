import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ListFrozenPositionsRequest extends BaseUserDORequest {

}

export interface ListFrozenPositionsResponse {
    frozenPositions : Position[]
}