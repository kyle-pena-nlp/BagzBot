import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface ListFrozenPositionsInTrackerRequest extends HasPairAddresses {
    userID : number
}

export interface ListFrozenPositionsInTrackerResponse {
    frozenPositions : Position[]
}