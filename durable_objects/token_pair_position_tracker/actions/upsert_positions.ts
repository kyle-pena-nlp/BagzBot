import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface UpsertPositionsRequest extends HasPairAddresses {
    positions : Position[]
};

export interface UpsertPositionsResponse {
}