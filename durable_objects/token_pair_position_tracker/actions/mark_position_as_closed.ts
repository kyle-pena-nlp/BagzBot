import { DecimalizedAmount } from "../../../decimalized";
import { HasPairAddresses } from "./has_pair_addresses";

export interface MarkPositionAsClosedRequest extends HasPairAddresses {
    positionID : string
    tokenAddress : string
    vsTokenAddress : string
    netPNL : DecimalizedAmount
}

export interface MarkPositionAsClosedResponse {
    success: boolean
}