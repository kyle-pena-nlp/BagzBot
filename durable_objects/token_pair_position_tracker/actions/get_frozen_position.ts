import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface GetFrozenPositionFromTrackerRequest extends HasPairAddresses {
    telegramUserID : number
    positionID : string
}

export interface GetFrozenPositionFromTrackerResponse {
    frozenPosition : Position|undefined
}