import { HasPairAddresses } from "./has_pair_addresses";

export interface UpdateBuyConfirmationStatusRequest extends HasPairAddresses {
    positionID : string
    successfullyConfirmed : boolean
}

export interface UpdateBuyConfirmationStatusResponse {

}