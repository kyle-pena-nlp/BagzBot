import { Position } from "../../../positions/positions";

export interface GetPositionsFromTokenPairTrackerRequest {
	positionIDs : string[]
};

export interface GetPositionsFromTokenPairTrackerResponse {
	positions : Position[]
};