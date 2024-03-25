import { PositionRequest } from "../../../positions";
import { BaseUserDORequest } from "./base_user_action";

export interface OpenPositionRequest  extends BaseUserDORequest {
    chatID : number
    positionRequest: PositionRequest
}

export interface OpenPositionResponse {
}