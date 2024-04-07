import { PositionStatus } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface GetPositionCountsFromTrackerRequest extends HasPairAddresses {
}

export interface GetPositionCountsFromTrackerResponse {
    positionCounts : Record<PositionStatus,number>
    countsByUser : Record<number,number>
}