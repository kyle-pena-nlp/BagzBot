import { DecimalizedAmount } from "../decimalized";
import { TokenInfo } from "../tokens";

export interface Quote {
    inToken : TokenInfo
    outToken : TokenInfo
    inTokenAmt : DecimalizedAmount
    outTokenAmt : DecimalizedAmount
    fee : DecimalizedAmount
    feeToken : TokenInfo
    botFee : DecimalizedAmount
    botFeeToken: TokenInfo    
    priceImpactPct : number
    slippageBps : number
    platformFeeBps: number
}