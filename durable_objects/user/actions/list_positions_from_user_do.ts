import { PositionAndMaybePNL } from "../../token_pair_position_tracker/model/position_and_PNL";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ListPositionsFromUserDORequest  extends BaseUserDORequest {
}

export interface ListPositionsFromUserDOResponse {
    positions : PositionAndMaybePNL[]
}