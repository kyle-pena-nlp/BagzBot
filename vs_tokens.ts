export enum VsToken {
	SOL = "SOL",
	USDC = "USDC"
};

export function getVsTokenAddress(vsToken : string|VsToken) : string|null {
    if (vsToken === VsToken.SOL || vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return SOL_ADDRESS;
    }
    else if (vsToken === VsToken.USDC || vsToken === USDC_ADDRESS || vsToken === USDC_SYMBOL || vsToken === USDC_NAME) {
        return USDC_ADDRESS;
    }
    else {
        return null;
    }
}

export function getVsTokenSymbol(vsToken : string|VsToken) : string|null {
    if (vsToken === VsToken.SOL || vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return SOL_SYMBOL;
    }
    else if (vsToken === VsToken.USDC || vsToken === USDC_ADDRESS || vsToken === USDC_SYMBOL || vsToken === USDC_NAME) {
        return USDC_SYMBOL;
    }
    else {
        return null;
    }
}

export function getVsTokenName(vsToken : string|VsToken) : string|null {
    if (vsToken === VsToken.SOL || vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return SOL_NAME;
    }
    else if (vsToken === VsToken.USDC || vsToken === USDC_ADDRESS || vsToken === USDC_SYMBOL || vsToken === USDC_NAME) {
        return USDC_NAME;
    }
    else {
        return null;
    }
}

export function getVsToken(vsToken : string|VsToken) : VsToken|null {
    if (vsToken === VsToken.SOL || vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return VsToken.SOL;
    }
    else if (vsToken === VsToken.USDC || vsToken === USDC_ADDRESS || vsToken === USDC_SYMBOL || vsToken === USDC_NAME) {
        return VsToken.USDC;
    }
    else {
        return null;
    }
}

export function getVsTokenDecimalsMultiplier(vsToken : string|VsToken) : number|null {
    if (vsToken === VsToken.SOL || vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return 1000000000;
    }
    else if (vsToken === VsToken.USDC || vsToken === USDC_ADDRESS || vsToken === USDC_SYMBOL || vsToken === USDC_NAME) {
        return 1000000;
    }
    else {
        return null;
    }
}


export const SOL_ADDRESS = "So11111111111111111111111111111111111111112"
export const SOL_SYMBOL = "SOL"
export const SOL_NAME = "Wrapped SOL"

export const USDC_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
export const USDC_SYMBOL = "USDC"
export const USDC_NAME = "USD Coin"