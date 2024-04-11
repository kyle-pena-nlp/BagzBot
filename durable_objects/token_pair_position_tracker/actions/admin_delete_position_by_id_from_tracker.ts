import { HasPairAddresses } from "./has_pair_addresses";

export interface AdminDeletePositionByIDFromTrackerRequest extends HasPairAddresses {
    positionID : string
}

export interface AdminDeletePositionByIDFromTrackerResponse {
    success: boolean
}