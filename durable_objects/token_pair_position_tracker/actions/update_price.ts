import { DecimalizedAmount } from "../../../decimalized";
import { HasPairAddresses } from "./has_pair_addresses";

export interface UpdatePriceRequest extends HasPairAddresses {
    price : DecimalizedAmount
}

export interface UpdatePriceResponse {
}