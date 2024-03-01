import { Env, Position, PositionRequest, Wallet } from "./common";
import { makeJSONRequest } from "./http_helpers";
import { TokenInfo } from "./token_tracker";
import { getVsTokenDecimalsMultiplier } from "./vs_tokens";
import { Connection, PublicKey, Signer, VersionedTransaction } from '@solana/web3.js';
import * as bs58 from "bs58";


export async function buyToken(positionRequest: PositionRequest, wallet : Wallet, env : Env) {
    const buyTokenSwapRoute = await getBuyTokenSwapRoute(positionRequest, env);
    const serializedSwapTransaction = await serializeSwapRouteTransaction(buyTokenSwapRoute, wallet.publicKey, env);
    const rawSignedTransaction = await signTransaction(serializedSwapTransaction, wallet);
    await executeRawTransaction(rawSignedTransaction, env);
}

export async function sellPosition(position : Position, tokenInfo : TokenInfo, wallet: Wallet, env : Env) {
    const buyTokenSwapRoute = await getSellTokenSwapRoute(position, tokenInfo, wallet, env);
    const serializedSwapTransaction = await serializeSwapRouteTransaction(buyTokenSwapRoute, wallet.publicKey, env);
    const rawSignedTransaction = await signTransaction(serializedSwapTransaction, wallet);
    await executeRawTransaction(rawSignedTransaction, env);
}

export async function getSellTokenSwapRoute(position : Position, tokenInfo : TokenInfo, wallet : Wallet, env : Env) {
    const tokenAddress = position.tokenAddress;
    const vsTokenAddress = position.vsTokenAddress;
    const decimalizedTokenAmount = position.tokenAmt * Math.pow(10, tokenInfo.decimals);
    const slippageBps = position.sellSlippagePercent * 100;
    const platformFeeBps = parseInt(env.PLATFORM_FEE_BPS,10);
    const quote_api_parameterized_url = makeQuoteAPIURL(tokenAddress, vsTokenAddress, decimalizedTokenAmount, slippageBps, platformFeeBps, env);
    const quoteResponse = await fetch(quote_api_parameterized_url);
    const quoteResponseJSON = await quoteResponse.json();
    return quoteResponseJSON;
}

async function getBuyTokenSwapRoute(positionRequest : PositionRequest, env : Env) : Promise<any> {
    const vsTokenAddress = positionRequest.vsTokenAddress;
    const tokenAddress = positionRequest.tokenAddress;
    const slippageBps = positionRequest.slippagePercent * 100;
    const vsTokenDecimalsMultiplier = getVsTokenDecimalsMultiplier(vsTokenAddress)!!;
    const decimalizedVsTokenAmount = positionRequest.vsTokenAmt * vsTokenDecimalsMultiplier;
    const platformFeeBps = parseInt(env.PLATFORM_FEE_BPS,10);
    const quote_api_parameterized_url = makeQuoteAPIURL(vsTokenAddress, tokenAddress, decimalizedVsTokenAmount, slippageBps, platformFeeBps, env);
    const quoteResponse = await fetch(quote_api_parameterized_url);
    const quoteResponseJSON = await quoteResponse.json();
    return quoteResponseJSON;
}

function makeQuoteAPIURL(inputTokenAddress : string, outputTokenAddress : string, decimalizedAmount : number, slippageBps : number, platformFeeBps : number, env : Env) {
    return `${env.JUPITER_QUOTE_API_URL}?inputMint=${inputTokenAddress}\
    &outputMint=${outputTokenAddress}\
    &amount=${decimalizedAmount}\
    &slippageBps=${slippageBps}\
    &platformFeeBps=${platformFeeBps}`;
}

async function serializeSwapRouteTransaction(swapRoute : any, publicKey : string, env : Env) {
    const body = {
        swapRoute,
      userPublicKey: publicKey,
      wrapAndUnwrapSol: true,
      feeAccount: env.FEE_ACCOUNT_PUBLIC_KEY
    };
    const swapRequestResponse = await makeJSONRequest(env.JUPITER_SWAP_API_URL, body);
    const swapRequestResponseJSON : any = await swapRequestResponse.json();
    return swapRequestResponseJSON.swapTransaction; 
}

async function signTransaction(swapTransaction : string, wallet : Wallet) : Promise<Uint8Array> {
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    const signer = toSigner(wallet);
    transaction.sign([signer]);
    const rawSignedTransaction = transaction.serialize();
    return rawSignedTransaction;
}

async function executeRawTransaction(rawSignedTransaction : Uint8Array, env : Env) {
    // // TODO: implement this: https://station.jup.ag/docs/apis/swap-api#advance-error-handling-to-disable-certain-amm-from-the-api 
    const connection = new Connection(env.RPC_ENDPOINT_URL);
    const txid = await connection.sendRawTransaction(rawSignedTransaction, {
        skipPreflight: true,
        maxRetries: 2
    });
    // TODO: is this the right committment level? I'm not sure I understand this code.
    // Note to self: What's the idea here?  
    // That this blockhash is the one containing our transaction, if not a later one?
    // And then the confirmTransaction validates what exactly?
    const latestBlockHash = await connection.getLatestBlockhash('finalized');
    await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid
    });
    console.log(`https://solscan.io/tx/${txid}`);
}

function toSigner(wallet : Wallet) : Signer {
    const publicKey = new PublicKey(wallet.publicKey);
    const privateKey =  bs58.decode(wallet.privateKey);
    return {
        publicKey : publicKey,
        secretKey : privateKey
    };
}