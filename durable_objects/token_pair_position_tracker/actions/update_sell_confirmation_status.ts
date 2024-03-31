import { HasPairAddresses } from "./has_pair_addresses";

export interface UpdateSellConfirmationStatusRequest extends HasPairAddresses {
    positionID : string
    sellTxSignature : string | null
    sellLastValidBlockheight : number | null
    status : 'confirmed'|'unconfirmed'|'failed'|'slippage-failed'
}

export interface UpdateSellConfirmationStatusResponse {

}