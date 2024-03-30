import { BaseUserDORequest } from "./base_user_do_request";

export interface AutomaticallyClosePositionsRequest extends BaseUserDORequest {
    positionIDs : string[]
};


// <-- UserDO
export interface AutomaticallyClosePositionsResponse {
}
