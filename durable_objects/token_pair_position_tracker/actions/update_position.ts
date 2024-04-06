import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface UpdatePositionRequest extends HasPairAddresses {
    position : Position
}

export interface UpdatePositionResponse {
    success: boolean
}