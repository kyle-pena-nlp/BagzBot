import { HasPairAddresses } from "./has_pair_addresses";

export interface MarkPositionAsClosingRequest extends HasPairAddresses {
    positionID : string;
}

export interface MarkPositionAsClosingResponse {

}