import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface ListClosedPositionsFromTrackerRequest extends HasPairAddresses {
    telegramUserID : number
}

export interface ListClosedPositionsFromTrackerResponse {
    closedPositions : Position[]
}