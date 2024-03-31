import { HasPairAddresses } from "./has_pair_addresses";

export interface SetSellAutoDoubleOnOpenPositionInTrackerRequest extends HasPairAddresses {
    positionID : string
    choice : boolean
}