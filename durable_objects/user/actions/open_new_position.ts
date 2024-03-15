import { PositionRequest } from "../../../positions";

export interface OpenPositionRequest {
    chatID : number
    userID : number
    positionRequest: PositionRequest
}

export interface OpenPositionResponse {
}