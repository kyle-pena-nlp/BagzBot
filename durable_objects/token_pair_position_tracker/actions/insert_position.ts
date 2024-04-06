import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface InsertPositionRequest extends HasPairAddresses {
    position : Position
}

export interface InsertPositionResponse  {
    success: boolean
}