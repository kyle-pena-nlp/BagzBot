import { HasPairAddresses } from "./has_pair_addresses";

export interface RemovePositionRequest extends HasPairAddresses {
    positionID : string
}

export interface RemovePositionResponse {
    
}