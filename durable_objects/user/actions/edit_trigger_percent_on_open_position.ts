import { PositionAndMaybePNL } from "../../token_pair_position_tracker/model/position_and_PNL";
import { BaseUserDORequest } from "./base_user_do_request";

export interface EditTriggerPercentOnOpenPositionRequest extends BaseUserDORequest  {
    positionID : string
    percent : number
}

export type EditTriggerPercentOnOpenPositionResponse = 'position-DNE'|'is-closing'|'is-closed'|'invalid-percent'|PositionAndMaybePNL

export function isEditOpenPositionTriggerPctSuccess(response : EditTriggerPercentOnOpenPositionResponse) : response is PositionAndMaybePNL  {
    return typeof response !== 'string';
}