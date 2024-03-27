import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetPositionFromUserDORequest  extends BaseUserDORequest {
	positionID : string
};

export interface GetPositionFromUserDOResponse {
	position: Position|undefined
}