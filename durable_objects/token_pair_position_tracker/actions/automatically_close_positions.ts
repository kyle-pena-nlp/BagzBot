import { HasPairAddresses } from "./has_pair_addresses";

export interface AutomaticallyClosePositionRequest extends HasPairAddresses {
    positionID : string
};

