export interface JupiterQuoteAPIParams {
    inputTokenAddress : string,
    outputTokenAddress : string,
    decimalizedAmount : string,
    slippageBps: number,
    platformFeeBps : number,
    // I am forbidding ExactOut b/c it makes other calculations incorrect, particularly fillprice in quote
    swapMode : 'ExactIn'
}

export interface SwapRoute {
    decimalizedExactInAmt : string,
    inTokenAddress : string,
    outTokenAddress : string,
    // I am forbidding ExactOut b/c it makes other calculations incorrect, particularly fillprice in quote
    swapMode : 'ExactIn' 
    swapTimeMS : number
    route : any
};