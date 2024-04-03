import { HasPairAddresses } from "./has_pair_addresses";

export interface PositionExistsInTrackerRequest extends HasPairAddresses {
    positionID : string
}

export interface PositionExistsInTrackerResponse {
    exists : boolean
}