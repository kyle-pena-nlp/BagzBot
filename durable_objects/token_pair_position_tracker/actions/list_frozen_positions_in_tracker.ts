import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface ListDeactivatedPositionsInTrackerRequest extends HasPairAddresses {
    userID : number
}

export interface ListDeactivatedPositionsInTrackerResponse {
    deactivatedPositions : Position[]
}