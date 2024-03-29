import { HasPairAddresses } from "./has_pair_addresses";

export interface EditTriggerPercentOnOpenPositionInTrackerRequest extends HasPairAddresses {
    positionID : string
    percent : number
}