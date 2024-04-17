import { HasPairAddresses } from "./has_pair_addresses";

export interface DoubleSellSlippageInTrackerRequest extends HasPairAddresses {
    positionID : string
    markAsOpen : boolean
}

export interface DoubleSellSlippageInTrackerResponse {

}