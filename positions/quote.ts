import { TokenInfo } from "../tokens/token_info"
import { DecimalizedAmount } from "../decimalized/decimalized_amount";

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
}