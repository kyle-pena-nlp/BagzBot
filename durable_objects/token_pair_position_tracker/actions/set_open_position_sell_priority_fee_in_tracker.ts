import { HasPairAddresses } from "./has_pair_addresses";

export interface SetOpenPositionSellPriorityFeeInTrackerRequest extends HasPairAddresses {
    positionID : string
    multiplier : 'auto'|number
}

export interface SetOpenPositionSellPriorityFeeInTrackerResponse {
    
}