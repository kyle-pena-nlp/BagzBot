import { HasPairAddresses } from "./has_pair_addresses";

export interface MarkPositionAsOpenRequest extends HasPairAddresses {
    positionID : string
}

export interface MarkPositionAsOpenResponse {
}