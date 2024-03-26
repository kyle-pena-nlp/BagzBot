import { Position } from "../../../positions";
import { HasPairAddresses } from "./has_pair_addresses";

export interface ListPositionsByUserRequest extends HasPairAddresses {
    telegramUserID : number
}

export interface ListPositionsByUserResponse {
    positions : Position[]
}