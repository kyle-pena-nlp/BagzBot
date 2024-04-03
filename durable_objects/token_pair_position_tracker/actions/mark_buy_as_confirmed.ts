import { HasPairAddresses } from "./has_pair_addresses";

export interface MarkBuyAsConfirmedRequest extends HasPairAddresses {
    positionID : string
}

export interface MarkBuyAsConfirmedResponse {
    
}