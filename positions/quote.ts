import { DecimalizedAmount } from "../decimalized";
import { TokenInfo } from "../tokens";
import { Structural } from "../util";

export interface Quote {
    readonly [ key : string ] : Structural
    inToken : TokenInfo
    outToken : TokenInfo
    inTokenAmt : DecimalizedAmount
    outTokenAmt : DecimalizedAmount
    fillPrice : DecimalizedAmount
    fee : DecimalizedAmount
    feeToken : TokenInfo
    botFee : DecimalizedAmount
    botFeeToken: TokenInfo    
    priceImpactPct : number
    slippageBps : number
    platformFeeBps: number
    quoteTimeMS : number
}