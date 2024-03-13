import { DecimalizedAmount } from "../../../decimalized/decimalized_amount";
import { TokenInfo } from "../../../tokens/token_info";

export type SessionKey = string; 

export type SessionValue = boolean|string|number|null|TokenInfo|DecimalizedAmount;