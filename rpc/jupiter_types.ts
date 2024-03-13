export interface JupiterQuoteAPIParams {
    inputTokenAddress : string,
    outputTokenAddress : string,
    decimalizedAmount : string,
    slippageBps: number,
    platformFeeBps : number,
    swapMode : 'ExactIn'|'ExactOut'
}

export interface SwapRoute {
    inTokenAddress : string,
    outTokenAddress : string,
    swapMode : 'ExactIn'|'ExactOut'
    route : any
};