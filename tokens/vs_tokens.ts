import { TokenInfo } from "./token_info";

export const SOL_ADDRESS = "So11111111111111111111111111111111111111112";
const SOL_SYMBOL = "SOL";
const SOL_NAME = "Wrapped SOL";

const USDC_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_SYMBOL = "USDC";
const USDC_NAME = "USD Coin";

export enum VsToken {
	SOL = "SOL",
	USDC = "USDC"
}

export function getVsTokenInfo(vsToken : string|VsToken) : TokenInfo|null {
    const address = getVsTokenAddress(vsToken);
    const name = getVsTokenName(vsToken);
    const symbol = getVsTokenSymbol(vsToken);
    const logoURI = getVsTokenLogoURI(vsToken);
    const decimals = getVsTokenDecimals(vsToken);
    if (address == null || name == null || symbol == null || logoURI == null || decimals == null) {
        return null;
    }
    return {
        address : address,
        name : name,
        symbol : symbol,
        logoURI : logoURI,
        decimals : decimals,
    };
}

export function getVsTokenLogoURI(vsToken : string|VsToken) : string|null {
    if (vsToken === VsToken.SOL || vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
    }
    else if (vsToken === VsToken.USDC || vsToken === USDC_ADDRESS || vsToken === USDC_SYMBOL || vsToken === USDC_NAME) {
        return "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png";
    }
    else {
        return null;
    }
}

export function getVsTokenDecimals(vsToken : string|VsToken) : number|null {
    if (vsToken === VsToken.SOL || vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return 9;
    }
    else if (vsToken === VsToken.USDC || vsToken === USDC_ADDRESS || vsToken === USDC_SYMBOL || vsToken === USDC_NAME) {
        return 6;
    }
    else {
        return null;
    }
}

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


