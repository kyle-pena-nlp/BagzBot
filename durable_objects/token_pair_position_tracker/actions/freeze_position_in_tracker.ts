import { HasPairAddresses } from "./has_pair_addresses";

export interface FreezePositionInTrackerRequest extends HasPairAddresses {
    positionID : string
}

export interface FreezePositionInTrackerResponse {
    success: boolean
}