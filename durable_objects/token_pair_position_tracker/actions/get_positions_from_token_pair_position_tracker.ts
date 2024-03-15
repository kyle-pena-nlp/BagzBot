import { Position } from "../../../positions";

export interface GetPositionsFromTokenPairTrackerRequest {
	positionIDs : string[]
};

export interface GetPositionsFromTokenPairTrackerResponse {
	positions : Position[]
};