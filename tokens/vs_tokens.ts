import { TokenInfo } from "./token_info";

export const SOL_ADDRESS = "So11111111111111111111111111111111111111112";
const SOL_SYMBOL = "SOL";
const SOL_NAME = "Wrapped SOL";

export function getVsTokenInfo(vsToken : string) : TokenInfo {
    const address = getVsTokenAddress(vsToken);
    const name = getVsTokenName(vsToken);
    const symbol = getVsTokenSymbol(vsToken);
    const logoURI = getVsTokenLogoURI(vsToken);
    const decimals = getVsTokenDecimals(vsToken);
    return {
        address : address,
        name : name,
        symbol : symbol,
        logoURI : logoURI,
        decimals : decimals,
    };
}

function getVsTokenLogoURI(vsToken : string) : string {
    if (vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
    }
    else {
        throw new Error();
    }
}

function getVsTokenDecimals(vsToken : string) : number {
    if (vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return 9;
    }
    else {
        throw new Error();
    }
}

function getVsTokenAddress(vsToken : string) : string {
    if (vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return SOL_ADDRESS;
    }
    else {
        throw new Error();
    }
}

function getVsTokenSymbol(vsToken : string) : string {
    if (vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return SOL_SYMBOL;
    }
    else {
        throw new Error();
    }
}

function getVsTokenName(vsToken : string) : string {
    if (vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return SOL_NAME;
    }
    else {
        throw new Error();
    }
}

export function getVsTokenDecimalsMultiplier(vsToken : string) : number {
    if (vsToken === SOL_ADDRESS || vsToken === SOL_SYMBOL || vsToken === SOL_NAME) {
        return 1000000000;
    }
    else {
        throw new Error();
    }
}


