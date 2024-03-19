import { HasPairAddresses } from "./has_pair_addresses";

export interface MarkPositionAsClosedRequest extends HasPairAddresses {
    positionID : string
    tokenAddress : string
    vsTokenAddress : string
}

export interface MarkPositionAsClosedResponse {
}