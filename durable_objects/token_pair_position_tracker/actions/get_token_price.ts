import { DecimalizedAmount } from "../../../decimalized";
import { HasPairAddresses } from "./has_pair_addresses";

export interface GetTokenPriceRequest extends HasPairAddresses {
}

export interface GetTokenPriceResponse {
    price : DecimalizedAmount|null
}