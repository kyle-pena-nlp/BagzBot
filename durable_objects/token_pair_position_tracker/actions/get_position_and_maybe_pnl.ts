import { PositionAndMaybePNL } from "../model/position_and_PNL";
import { HasPairAddresses } from "./has_pair_addresses";

export interface GetPositionAndMaybePNLFromPriceTrackerRequest  extends HasPairAddresses {
    positionID : string
}

export interface GetPositionAndMaybePNLFromPriceTrackerResponse {
    maybePosition : PositionAndMaybePNL|undefined
}