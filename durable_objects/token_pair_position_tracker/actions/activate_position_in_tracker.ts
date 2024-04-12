import { HasPairAddresses } from "./has_pair_addresses";

export interface ReactivatePositionInTrackerRequest extends HasPairAddresses {
    userID : number
    positionID : string
}

export interface ReactivatePositionInTrackerResponse {
    success : boolean
}