import { PositionAndMaybePNL } from "../model/position_and_PNL";
import { HasPairAddresses } from "./has_pair_addresses";

export interface ListPositionsByUserRequest extends HasPairAddresses {
    telegramUserID : number
}

export interface ListPositionsByUserResponse {
    positions : PositionAndMaybePNL[]
}