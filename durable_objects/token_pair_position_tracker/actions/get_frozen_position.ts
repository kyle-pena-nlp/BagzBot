import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface GetDeactivatedPositionFromTrackerRequest extends HasPairAddresses {
    telegramUserID : number
    positionID : string
}

export interface GetDeactivatedPositionFromTrackerResponse {
    deactivatedPosition : Position|undefined
}