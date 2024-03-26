import { PositionRequest } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface OpenPositionRequest  extends BaseUserDORequest {
    chatID : number
    positionRequest: PositionRequest
}

export interface OpenPositionResponse {
}