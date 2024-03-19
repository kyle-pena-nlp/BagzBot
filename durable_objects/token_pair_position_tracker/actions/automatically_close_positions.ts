import { Position } from "../../../positions/position";
import { HasPairAddresses } from "./has_pair_addresses";

export interface AutomaticallyClosePositionRequest extends HasPairAddresses {
    positionID : string
};

export interface AutomaticallyClosePositionsRequest {
    positions : Position[]
};


// <-- UserDO
export interface AutomaticallyClosePositionsResponse {
}
