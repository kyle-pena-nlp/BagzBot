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


export const SOL_ADDRESS = ""
export const SOL_SYMBOL = ""
export const SOL_NAME = ""

export const USDC_ADDRESS = ""
export const USDC_SYMBOL = ""
export const USDC_NAME = ""