import { HasPairAddresses } from "./has_pair_addresses";

export interface AutomaticallyClosePositionRequest extends HasPairAddresses {
    positionID : string
};

export interface AutomaticallyClosePositionsRequest {
    positionIDs : string[]
};


// <-- UserDO
export interface AutomaticallyClosePositionsResponse {
}
