import { HasPairAddresses } from "./has_pair_addresses";

export interface UnfreezePositionInTrackerRequest extends HasPairAddresses {
    userID : number
    positionID : string
}

export interface UnfreezePositionInTrackerResponse {
    success : boolean
}