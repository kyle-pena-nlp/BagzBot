import { PositionStatus } from "../../../positions";

export interface AdminCountPositionsRequest {
}

export interface AdminCountPositionsResponse {
    positionCounts : Record<string,Record<PositionStatus,number>>;
}