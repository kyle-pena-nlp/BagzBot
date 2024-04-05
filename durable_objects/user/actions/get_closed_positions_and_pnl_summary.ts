import { DecimalizedAmount } from "../../../decimalized";
import { Position } from "../../../positions";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ClosedPositionsPNLSummary {
    netSOL : DecimalizedAmount
}

export interface GetClosedPositionsAndPNLSummaryRequest extends BaseUserDORequest {
}

export interface GetClosedPositionsAndPNLSummaryResponse {
    closedPositions : Position[]
    closedPositionsPNLSummary : ClosedPositionsPNLSummary
}