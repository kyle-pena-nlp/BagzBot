import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ClosedPositionsPNLSummary {
    netSOL : number
}

export interface GetClosedPositionsAndPNLSummaryRequest extends BaseUserDORequest {
}

export interface GetClosedPositionsAndPNLSummaryResponse {
    closedPositions : Position[]
    closedPositionsPNLSummary : ClosedPositionsPNLSummary
}