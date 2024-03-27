import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ListPositionsFromUserDORequest  extends BaseUserDORequest {
}

export interface ListPositionsFromUserDOResponse {
    positions : Position[]
}