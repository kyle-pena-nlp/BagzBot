import { HasPairAddresses } from "./has_pair_addresses";

export interface IncrementOtherSellFailureCountInTrackerRequest extends HasPairAddresses {
    positionID : string
}

export type IncrementOtherSellFailureCountInTrackerResponse = { success : true, newCount : number } | { success: false };