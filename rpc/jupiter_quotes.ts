
import { DecimalizedAmount, MATH_DECIMAL_PLACES, dDiv } from "../decimalized";
import { Env } from "../env";
import { Position, PositionRequest, Quote } from "../positions";
import { TokenInfo, getVsTokenDecimalsMultiplier, getVsTokenInfo } from "../tokens";
import { JupiterQuoteAPIParams, SwapRoute } from "./jupiter_types";
import { GetQuoteFailure, isGetQuoteFailure } from "./rpc_types";

export async function quoteBuy(positionRequest : PositionRequest,  env : Env) : Promise<GetQuoteFailure|Quote> {
    const swapRoute = await getBuyTokenSwapRoute(positionRequest, env);
    const inTokenInfo = positionRequest.vsToken;
    const outTokenInfo = positionRequest.token;
    return makeQuote(swapRoute, inTokenInfo, outTokenInfo);
}

export async function quoteSell(position : Position, env : Env) : Promise<GetQuoteFailure|Quote> {
    const swapRoute = await getSellTokenSwapRoute(position, env);
    const outTokenInfo = position.vsToken;
    const inTokenInfo = position.token;
    return makeQuote(swapRoute, inTokenInfo, outTokenInfo);
}

async function makeQuote(swapRoute : GetQuoteFailure|SwapRoute, inTokenInfo : TokenInfo, outTokenInfo : TokenInfo) : Promise<GetQuoteFailure|Quote> {
    if (isGetQuoteFailure(swapRoute)) {
        return swapRoute;
    }
    const route = swapRoute.route;
    const inTokenAmount = route.inAmount as string;
    const outTokenAmount = route.outAmount as string;
    const solTokenInfo = getVsTokenInfo('SOL');
    const priceImpactPct = parseFloat(route.priceImpactPct||'0' as string);
    const botFee : DecimalizedAmount = { tokenAmount: route?.platformFee?.amount || '0', decimals: outTokenInfo.decimals };
    const botFeeToken = outTokenInfo; // fees are charged in units of what token you are buying
    const slippageBps = route.slippageBps as number;
    const platformFeeBps = route.platformFee?.feeBps || 0;
    const estimatedFee : DecimalizedAmount = {
        tokenAmount: "5000000",
        decimals: solTokenInfo.decimals
    };
    const inTokenAmt = { tokenAmount : inTokenAmount, decimals : inTokenInfo.decimals };
    const outTokenAmt = { tokenAmount : outTokenAmount, decimals : outTokenInfo.decimals };
    const fillPrice = dDiv(outTokenAmt, inTokenAmt, MATH_DECIMAL_PLACES);
    const quote : Quote = {
        inToken: inTokenInfo,
        inTokenAmt: inTokenAmt,
        outToken : outTokenInfo,
        outTokenAmt: outTokenAmt,
        fillPrice : fillPrice,
        fee : estimatedFee,
        feeToken : solTokenInfo,
        botFee: botFee,
        botFeeToken: botFeeToken,
        priceImpactPct: priceImpactPct,
        slippageBps: slippageBps,
        platformFeeBps: platformFeeBps
    };
    return quote;
}

// TODO: unify the buy/sell method somehow to reduce code duplication
export async function getBuyTokenSwapRoute(positionRequest : PositionRequest, env : Env) : Promise<SwapRoute|GetQuoteFailure> {
    const vsTokenAddress = positionRequest.vsToken.address;
    const tokenAddress = positionRequest.token.address;
    const slippageBps = positionRequest.slippagePercent * 100;
    const vsTokenDecimalsMultiplier = getVsTokenDecimalsMultiplier(vsTokenAddress);
    const decimalizedVsTokenAmount = (positionRequest.vsTokenAmt * vsTokenDecimalsMultiplier).toString();
    // I am punting on this for the moment due to complications with the referral program.
    const platformFeeBps = 0.0; //parseInt(env.PLATFORM_FEE_BPS,10);
    const quoteAPIParams : JupiterQuoteAPIParams = {
        inputTokenAddress: vsTokenAddress, 
        outputTokenAddress: tokenAddress, 
        decimalizedAmount: decimalizedVsTokenAmount, 
        slippageBps: slippageBps, 
        platformFeeBps: platformFeeBps,
        swapMode: 'ExactIn' 
    };
    return await getSwapRoute(quoteAPIParams, env);
}

export async function getSellTokenSwapRoute(position : Position, env : Env) : Promise<SwapRoute|GetQuoteFailure> {
    const tokenAddress = position.token.address;
    const vsTokenAddress = position.vsToken.address;
    const decimalizedTokenAmount = position.tokenAmt.tokenAmount;
    const slippageBps = position.sellSlippagePercent * 100;
    const platformFeeBps = parseInt(env.PLATFORM_FEE_BPS,10);
    const quoteAPIParams : JupiterQuoteAPIParams = {
        inputTokenAddress: tokenAddress, 
        outputTokenAddress: vsTokenAddress, 
        decimalizedAmount: decimalizedTokenAmount, 
        slippageBps: slippageBps, 
        platformFeeBps: platformFeeBps, 
        swapMode: 'ExactIn'
    };
    return await getSwapRoute(quoteAPIParams, env);
}

async function getSwapRoute(quoteAPIParams : JupiterQuoteAPIParams, env: Env) : Promise<SwapRoute|GetQuoteFailure> {
    const quote_api_parameterized_url = makeJupiterQuoteAPIURL(quoteAPIParams, env);
    try {
        const quoteResponse = await fetch(quote_api_parameterized_url);
        if (!quoteResponse.ok) {
            return GetQuoteFailure.FailedToDetermineSwapRoute;
        }
        const quoteResponseJSON = await quoteResponse.json();
        return { 
            inTokenAddress: quoteAPIParams.inputTokenAddress,
            outTokenAddress: quoteAPIParams.outputTokenAddress,
            swapMode: quoteAPIParams.swapMode,
            route: quoteResponseJSON as object
        };
    }
    catch {
        return GetQuoteFailure.FailedToDetermineSwapRoute;
    }
}

function makeJupiterQuoteAPIURL(params : JupiterQuoteAPIParams,
    env : Env) {
    // https://station.jup.ag/api-v6/get-quote
    const hasPlatformFee = params.platformFeeBps && params.platformFeeBps > 0;
    const parts = [
        `${env.JUPITER_QUOTE_API_URL}?inputMint=${params.inputTokenAddress}`,
        `&outputMint=${params.outputTokenAddress}`,
        `&amount=${params.decimalizedAmount}`,
        `&slippageBps=${params.slippageBps}`,
        hasPlatformFee ? `&platformFeeBps=${params.platformFeeBps}` : '',
        `&swapMode=${params.swapMode}`
    ];
    return parts.join('');
}
