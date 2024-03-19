import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface GetPositionsFromTokenPairTrackerRequest extends HasPairAddresses {
	positionIDs : string[]
};

export interface GetPositionsFromTokenPairTrackerResponse {
	positions : Position[]
};