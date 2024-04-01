import { HasPairAddresses } from "./has_pair_addresses";

export interface UpdateBuyConfirmationStatusRequest extends HasPairAddresses {
    positionID : string
    status : 'confirmed'|'unconfirmed'|'failed'|'slippage-failed'
}

export interface UpdateBuyConfirmationStatusResponse {

}