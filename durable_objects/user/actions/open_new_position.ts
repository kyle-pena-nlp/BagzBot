import { PositionRequest } from "../../../positions";
import { BaseUserAction } from "./base_user_action";

export interface OpenPositionRequest  extends BaseUserAction {
    chatID : number
    positionRequest: PositionRequest
}

export interface OpenPositionResponse {
}