import { HasPairAddresses } from "./has_pair_addresses";

export interface UpdateSellConfirmationStatusRequest extends HasPairAddresses {
    positionID : string
    successfullyConfirmed : boolean
}

export interface UpdateSellConfirmationStatusResponse {

}