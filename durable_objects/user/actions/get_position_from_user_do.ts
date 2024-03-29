import { Position } from "../../../positions";
import { PositionAndMaybePNL } from "../../token_pair_position_tracker/model/position_and_PNL";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetPositionFromUserDORequest  extends BaseUserDORequest {
	positionID : string
};

export interface GetPositionFromUserDOResponse {
	position: PositionAndMaybePNL|undefined
}