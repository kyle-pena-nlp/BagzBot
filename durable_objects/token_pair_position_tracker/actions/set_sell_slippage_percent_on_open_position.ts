import { HasPairAddresses } from "./has_pair_addresses";

export interface SetSellSlippagePercentOnOpenPositionTrackerRequest extends HasPairAddresses {
    positionID : string
    sellSlippagePercent : number
}