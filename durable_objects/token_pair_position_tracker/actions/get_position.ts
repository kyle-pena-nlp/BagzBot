import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface GetPositionFromPriceTrackerRequest  extends HasPairAddresses {
    positionID : string
}

export interface GetPositionFromPriceTrackerResponse {
    maybePosition : Position|undefined
}