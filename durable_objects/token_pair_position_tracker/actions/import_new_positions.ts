import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface ImportNewPositionsRequest extends HasPairAddresses {
    positions : Position[]
};

export interface ImportNewPositionsResponse {
}