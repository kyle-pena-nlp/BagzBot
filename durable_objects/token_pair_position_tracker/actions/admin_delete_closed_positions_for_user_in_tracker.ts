import { HasPairAddresses } from "./has_pair_addresses";

export interface AdminDeleteClosedPositionsForUserInTrackerRequest extends HasPairAddresses {
    telegramUserID : number
}

export interface AdminDeleteClosedPositionsForUserInTrackerResponse {
    
}