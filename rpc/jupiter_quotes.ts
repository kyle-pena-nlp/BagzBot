
import { DecimalizedAmount, MATH_DECIMAL_PLACES, dDiv, dSub } from "../decimalized";
import { dZero } from "../decimalized/decimalized_amount";
import { Env, getQuoteAPIURL } from "../env";
import { Position, PositionPreRequest, PositionRequest, Quote } from "../positions";
import { TokenInfo, getVsTokenDecimalsMultiplier, getVsTokenInfo } from "../tokens";
import { assertNever, strictParseBoolean } from "../util";
import { JupiterQuoteAPIParams, SwapRoute } from "./jupiter_types";
import { GetQuoteFailure, isGetQuoteFailure } from "./rpc_types";

export async function quoteBuy(positionRequest : PositionPreRequest|PositionRequest, token : TokenInfo,  env : Env) : Promise<GetQuoteFailure|Quote> {
    const swapRoute = await getBuyTokenSwapRoute(positionRequest, env);
    const inTokenInfo = positionRequest.vsToken;
    const outTokenInfo = token;
    return makeQuote(swapRoute, inTokenInfo, outTokenInfo);
}

export async function quoteSell(position : Position, env : Env) : Promise<GetQuoteFailure|Quote> {
    const swapRoute = await getSellTokenSwapRoute(position, env);
    const outTokenInfo = position.vsToken;
    const inTokenInfo = position.token;
    return makeQuote(swapRoute, inTokenInfo, outTokenInfo);
}

export async function calculatePriceUsingQuote(token : TokenInfo, vsToken : TokenInfo, env : Env) : Promise<GetQuoteFailure|DecimalizedAmount> {
    // My hope is that with a slippageBps of 500 and 0.1 SOL, that will be enough to avoid slippage errors and consistently return a value
    const decimalizedVsTokenAmount = Math.floor(0.1 * getVsTokenDecimalsMultiplier('SOL')).toString(10);
    const quoteAPIParams : JupiterQuoteAPIParams = {
        inputTokenAddress: vsToken.address, 
        outputTokenAddress: token.address, 
        decimalizedAmount: decimalizedVsTokenAmount, 
        slippageBps: 500, 
        platformFeeBps: 0,
        swapMode: 'ExactIn' 
    };
    const swapRoute = await getSwapRoute(quoteAPIParams, env);
    if (isGetQuoteFailure(swapRoute)) {
        return swapRoute;
    }
    const route = swapRoute.route;
    
    const inAmount : DecimalizedAmount = { tokenAmount: route["inAmount"] as string, decimals: vsToken.decimals };
    const outAmount : DecimalizedAmount = { tokenAmount : route["outAmount"] as string, decimals : token.decimals };
    const price = dDiv(inAmount,outAmount,MATH_DECIMAL_PLACES)||dZero();
    return price;
}

async function makeQuote(swapRoute : GetQuoteFailure|SwapRoute, inTokenInfo : TokenInfo, outTokenInfo : TokenInfo) : Promise<GetQuoteFailure|Quote> {
    if (isGetQuoteFailure(swapRoute)) {
        return swapRoute;
    }
    const route = swapRoute.route;
    const inTokenAmount = route.inAmount as string; // if IN == SOL, this also includes rent, fees, etc.
    const outTokenAmount = route.outAmount as string;
    const solTokenInfo = getVsTokenInfo('SOL');
    const priceImpactPct = parseFloat(route.priceImpactPct||'0' as string);
    const botFee : DecimalizedAmount = { tokenAmount: route?.platformFee?.amount || '0', decimals: outTokenInfo.decimals };
    const botFeeToken = outTokenInfo; // fees are charged in units of what token you are buying
    const slippageBps = route.slippageBps as number;
    const platformFeeBps = route.platformFee?.feeBps || 0;
    const inTokenAmt = { tokenAmount : inTokenAmount, decimals : inTokenInfo.decimals };
    const outTokenAmt = { tokenAmount : outTokenAmount, decimals : outTokenInfo.decimals };
    const exactInAmt = { tokenAmount : swapRoute.decimalizedExactInAmt, decimals : inTokenInfo.decimals };
    const estimatedFee = dSub(inTokenAmt, exactInAmt);
    // For the buy:
    // in / out <-> SOL / chonky <-> $$ / taco <-> a taco cost $1.50
    const fillPrice = dDiv(inTokenAmt, outTokenAmt, MATH_DECIMAL_PLACES) || dZero();
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
        platformFeeBps: platformFeeBps,
        quoteTimeMS: swapRoute.swapTimeMS
    };
    return quote;
}

// TODO: unify the buy/sell method somehow to reduce code duplication
export async function getBuyTokenSwapRoute(positionRequest : PositionPreRequest|PositionRequest, env : Env) : Promise<SwapRoute|GetQuoteFailure> {
    const vsTokenAddress = positionRequest.vsToken.address;
    const tokenAddress = getTokenAddress(positionRequest);
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

function getTokenAddress(p : PositionPreRequest|PositionRequest) : string {
    if (('token' in p)) {
        return (p.token as TokenInfo).address;
    }
    else if (('tokenAddress' in p)) {
        return p.tokenAddress;
    }
    else {
        assertNever(p);
    }
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
            decimalizedExactInAmt: quoteAPIParams.decimalizedAmount, 
            inTokenAddress: quoteAPIParams.inputTokenAddress,
            outTokenAddress: quoteAPIParams.outputTokenAddress,
            swapMode: quoteAPIParams.swapMode,
            swapTimeMS : Date.now(), // not absolutely precise but gonna be pretty close. API response didn't have timestamp
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
    const restrictIntermediaTokens = strictParseBoolean(env.JUP_QUOTE_RESTRICT_INTERMEDIATE_TOKENS);
    const parts = [
        `${getQuoteAPIURL(env)}?inputMint=${params.inputTokenAddress}`,
        `&outputMint=${params.outputTokenAddress}`,
        `&amount=${params.decimalizedAmount}`,
        `&slippageBps=${params.slippageBps}`,
        hasPlatformFee ? `&platformFeeBps=${params.platformFeeBps}` : '',
        restrictIntermediaTokens ? `&restrictIntermediateTokens=true` : '',
        `&swapMode=${params.swapMode}`
    ];
    return parts.join(''); // only join with '' to avoid empty spaces around '' entries in array
}
