import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface AutomaticallyClosePositionsRequest extends BaseUserDORequest {
    positions : Position[]
};


// <-- UserDO
export interface AutomaticallyClosePositionsResponse {
}
