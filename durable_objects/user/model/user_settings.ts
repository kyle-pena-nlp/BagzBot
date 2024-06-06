export interface UserSettings {
    quickBuyEnabled : boolean
    quickBuySOLAmount : number
    quickBuyPriorityFee : 'auto'|number
    quickBuySlippagePct : number
    quickBuyTSLTriggerPct : number
    quickBuyAutoDoubleSlippage : boolean
}