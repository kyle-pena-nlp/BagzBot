import { HasPairAddresses } from "./has_pair_addresses";

export interface GetPositionCountsFromTrackerRequest extends HasPairAddresses {
}

export interface GetPositionCountsFromTrackerResponse {
    positionCounts : Record<string,number> // status -> count
    countsByUser : Record<number,number>
}