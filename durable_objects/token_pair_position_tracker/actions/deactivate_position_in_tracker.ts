import { HasPairAddresses } from "./has_pair_addresses";

export interface DeactivatePositionInTrackerRequest extends HasPairAddresses {
    positionID : string
    markOpenBeforeDeactivating : boolean
}

export interface DeactivatePositionInTrackerResponse {
    success: boolean
}