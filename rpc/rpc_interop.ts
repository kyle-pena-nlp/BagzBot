import { Env } from "../env";
import { makeJSONRequest } from "../util/http_helpers";
import { getVsTokenDecimalsMultiplier } from "../tokens/vs_tokens";
import { Connection, PublicKey, Signer, VersionedTransaction } from '@solana/web3.js';
import * as bs58 from "bs58";
import { Position, PositionRequest } from "../positions/positions";
import { Wallet } from "../crypto/wallet";
import { dDiv } from "../positions/decimalized_math";
import { DecimalizedAmount, MATH_DECIMAL_PLACES } from "../decimalized/decimalized_amount";



// TODO: careful analysis of failure modes and their mitigations
// TODO: https://solanacookbook.com/guides/retrying-transactions.html#how-rpc-nodes-broadcast-transactions
// specifically: https://solanacookbook.com/guides/retrying-transactions.html#customizing-rebroadcast-logic 
// https://github.com/solana-labs/solana-program-library/blob/ea354ab358021aa08f774e2d4028b33ec56d4180/token/program/src/error.rs#L16


// couldn't even send the transaction
export enum TransactionPreparationFailure {
    FailedToDetermineSwapRoute = "FailedToDetermineSwapRoute",
    FailedToSerializeTransaction = "FailedToSerializeTransaction",
    FailedToSignTransaction = "FailedToSignTransaction"
};

// transaction sent, but wasn't executed
export enum TransactionExecutionError {
    TransactionExecutionError = "TransactionExecutionError" 
};

// transaction sent, but couldn't be confirmed
export enum TransactionConfirmationFailure {
    FailedToGetLatestBlockhash = "FailedToGetLatestBlockhash",
    FailedToConfirmTransaction = "FailedToConfirmTransaction",
};

export interface PreparseSwapResult {
    positionID : string
    status: TransactionPreparationFailure|TransactionExecutionError|TransactionConfirmationFailure|'transaction-confirmed'
    txID ?: string
}

export interface SwapResult {
    positionID : string
    status: TransactionPreparationFailure|TransactionExecutionError|TransactionConfirmationFailure|TransactionParseFailure|SwapExecutionError|'swap-successful'
    txID ?: string
    successfulSwapSummary ?: SuccessfulSwapSummary
};

export interface SuccessfulSwapSummary {
    inTokenAddress : string,
    inTokenAmt : DecimalizedAmount,
    outTokenAddress: string,
    outTokenAmt: DecimalizedAmount,
    fees: number
    fillPrice : DecimalizedAmount
};


// transaction finalized, but couldn't parse it
export enum TransactionParseFailure {
    BadRequest = "BadRequest",
    RateLimited = "RateLimited",
    UnknownTransaction = "UnknownTransaction",
    InternalError = "InternalError"
}

export enum SwapExecutionError {
    InsufficientBalance = "InsufficientBalance",
    SlippageToleranceExceeded = "SlippageToleranceExceeded",
    OtherError = "OtherError"
}


export interface SwapRoute {
    route : object
};

export interface ConfirmationErr {
    err: {}|string
};

export function isTransactionPreparationFailure<T>(obj : T|TransactionPreparationFailure) : obj is TransactionPreparationFailure {
    return typeof obj === 'object' && obj != null && Object.values(obj).includes(TransactionPreparationFailure.FailedToDetermineSwapRoute);
}

export function isTransactionExecutionFailure<T>(obj : T|TransactionExecutionError) : obj is TransactionExecutionError {
    return typeof obj === 'object' && obj != null && Object.values(obj).includes(TransactionExecutionError.TransactionExecutionError);
}

export function isTransactionConfirmationFailure<T>(obj : T|TransactionConfirmationFailure) : obj is TransactionConfirmationFailure {
    return typeof obj === 'object' && obj != null && Object.values(obj).includes(TransactionConfirmationFailure.FailedToConfirmTransaction);
}

export function isRetryableTransactionParseFailure<T>(obj : T | TransactionParseFailure) : obj is TransactionParseFailure.RateLimited|TransactionParseFailure.InternalError {
    return obj === TransactionParseFailure.RateLimited || obj === TransactionParseFailure.InternalError;
}

export function isTransactionParseFailure<T>(obj : T |TransactionParseFailure) : obj is TransactionParseFailure {
    return typeof obj === 'object' && obj != null && Object.values(obj).includes(TransactionParseFailure.BadRequest);
}

export function isSwapExecutionError<T>(obj: T | SwapExecutionError): obj is SwapExecutionError {
    return typeof obj === 'object' && obj != null && Object.values(obj).includes(SwapExecutionError.OtherError);
}

export async function buyTokenAndParseSwapTransaction(positionRequest : PositionRequest, wallet : Wallet, env: Env) : Promise<SwapResult>
{
    const positionID = positionRequest.positionID;
    return buyToken(positionRequest, wallet, env)
        .then(transactionResult => parseSwapTransaction(positionID, transactionResult, env))    
}

export async function sellTokenAndParseSwapTransaction(position : Position, wallet : Wallet, env : Env) : Promise<SwapResult> {
    const positionID = position.positionID;
    return sellToken(position, wallet, env)
        .then(transactionResult => parseSwapTransaction(positionID, transactionResult, env));
}

export async function buyToken(positionRequest: PositionRequest, wallet : Wallet, env : Env) : Promise<PreparseSwapResult> {
    const positionID = positionRequest.positionID;
    return getBuyTokenSwapRoute(positionRequest, env) 
        .then(swapRoute => getRawSignedTransaction(swapRoute, wallet, env))
        .then(rawSignedTx => executeRawSignedTransaction(positionID, rawSignedTx, env));
}

export async function sellToken(position : Position, wallet: Wallet, env : Env) : Promise<PreparseSwapResult> {
    const positionID = position.positionID;
    return getSellTokenSwapRoute(position, env) 
        .then(swapRoute => getRawSignedTransaction(swapRoute, wallet, env))
        .then(rawSignedTx => executeRawSignedTransaction(positionID, rawSignedTx, env));
}


async function getRawSignedTransaction(swapRoute : SwapRoute|TransactionPreparationFailure, wallet : Wallet, env : Env) : Promise<Uint8Array|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapRoute)) {
        return swapRoute;
    }
    return serializeSwapRouteTransaction(swapRoute, wallet.publicKey, env)
        .catch(reason => TransactionPreparationFailure.FailedToSerializeTransaction)
        .then(serializedSwapTransaction => signTransaction(serializedSwapTransaction, wallet))
}


export async function getSellTokenSwapRoute(position : Position, env : Env) : Promise<SwapRoute|TransactionPreparationFailure> {
    const tokenAddress = position.tokenAddress;
    const vsTokenAddress = position.vsTokenAddress;
    const decimalizedTokenAmount = position.tokenAmt.tokenAmount;
    const slippageBps = position.sellSlippagePercent * 100;
    const platformFeeBps = parseInt(env.PLATFORM_FEE_BPS,10);
    const quote_api_parameterized_url = makeQuoteAPIURL(tokenAddress, vsTokenAddress, decimalizedTokenAmount, slippageBps, platformFeeBps, env);
    try {
        const quoteResponse = await fetch(quote_api_parameterized_url);
        const quoteResponseJSON = await quoteResponse.json();
        return { route: quoteResponseJSON as object };
    }
    catch {
        return TransactionPreparationFailure.FailedToDetermineSwapRoute;
    }
}

async function getBuyTokenSwapRoute(positionRequest : PositionRequest, env : Env) : Promise<SwapRoute|TransactionPreparationFailure> {
    const vsTokenAddress = positionRequest.vsToken.address;
    const tokenAddress = positionRequest.token.address;
    const slippageBps = positionRequest.slippagePercent * 100;
    const vsTokenDecimalsMultiplier = getVsTokenDecimalsMultiplier(vsTokenAddress)!!;
    const decimalizedVsTokenAmount = (positionRequest.vsTokenAmt * vsTokenDecimalsMultiplier).toString();
    const platformFeeBps = parseInt(env.PLATFORM_FEE_BPS,10);
    const quote_api_parameterized_url = makeQuoteAPIURL(vsTokenAddress, tokenAddress, decimalizedVsTokenAmount, slippageBps, platformFeeBps, env);
    try {
        const quoteResponse = await fetch(quote_api_parameterized_url);
        const quoteResponseJSON = await quoteResponse.json();
        return { route: quoteResponseJSON as object };
    }
    catch {
        return TransactionPreparationFailure.FailedToDetermineSwapRoute;
    }
}

function makeQuoteAPIURL(inputTokenAddress : string, outputTokenAddress : string, decimalizedAmount : string, slippageBps : number, platformFeeBps : number, env : Env) {
    return `${env.JUPITER_QUOTE_API_URL}?inputMint=${inputTokenAddress}\
    &outputMint=${outputTokenAddress}\
    &amount=${decimalizedAmount}\
    &slippageBps=${slippageBps}\
    &platformFeeBps=${platformFeeBps}`;
}

async function serializeSwapRouteTransaction(swapRoute : SwapRoute|TransactionPreparationFailure, publicKey : string, env : Env) : Promise<Buffer|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapRoute)) {
        return swapRoute;
    }
    const body = {
      swapRoute,
      userPublicKey: publicKey,
      wrapAndUnwrapSol: true,
      feeAccount: env.FEE_ACCOUNT_PUBLIC_KEY
    };
    try {
        const swapRequestResponse = await makeJSONRequest(env.JUPITER_SWAP_API_URL, body);
        const swapRequestResponseJSON : any = await swapRequestResponse.json();
        return Buffer.from(swapRequestResponseJSON.swapTransaction, 'base64'); 
    }
    catch {
        return TransactionPreparationFailure.FailedToSerializeTransaction;
    }
}

async function signTransaction(swapTransaction : Buffer|TransactionPreparationFailure, wallet : Wallet) : Promise<Uint8Array|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapTransaction)) {
        return swapTransaction;
    }
    try {
        var transaction = VersionedTransaction.deserialize(swapTransaction);
        const signer = toSigner(wallet);
        transaction.sign([signer]);
        const rawSignedTransaction = transaction.serialize();
        return rawSignedTransaction;
    }
    catch {
        return TransactionPreparationFailure.FailedToSignTransaction;
    }
}

async function executeRawSignedTransaction(
    positionID : string,
    rawSignedTransaction : Uint8Array|TransactionPreparationFailure, 
    env : Env) : Promise<PreparseSwapResult> {
    
    if (isTransactionPreparationFailure(rawSignedTransaction)) {
        return { positionID : positionID, status: rawSignedTransaction };
    }

    const connection = new Connection(env.RPC_ENDPOINT_URL);
    
    const txID = await connection.sendRawTransaction(rawSignedTransaction, {
        skipPreflight: true,
        maxRetries: 2
    }).catch((reason) => TransactionExecutionError.TransactionExecutionError);

    if (isTransactionExecutionFailure(txID)) {
        return { positionID : positionID, status: txID };
    }

    return await confirmTransaction(txID, positionID, env, connection);
}

export async function confirmTransaction(txID : string, positionID : string, env : Env, connection?: Connection) : Promise<PreparseSwapResult> {

    if (connection == null) {
        connection = new Connection(env.RPC_ENDPOINT_URL);
    }

    const latestBlockhash = await connection.getLatestBlockhash('finalized').catch(reason => TransactionConfirmationFailure.FailedToGetLatestBlockhash);

    if (isTransactionConfirmationFailure(latestBlockhash)) {
        return { positionID : positionID, status: latestBlockhash, txID : txID };
    }

    const confirmationResponse = await connection.confirmTransaction({
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,  
        signature: txID
    }).catch((reason) => TransactionConfirmationFailure.FailedToConfirmTransaction);
    
    if (isTransactionConfirmationFailure(confirmationResponse)) {
        return { positionID : positionID, status: TransactionConfirmationFailure.FailedToConfirmTransaction, txID : txID };
    }

    const confirmationErr = confirmationResponse.value.err;

    if (confirmationErr && typeof confirmationErr === 'string') {
        return { positionID : positionID, status: TransactionConfirmationFailure.FailedToConfirmTransaction, txID : txID };
    }

    return { positionID : positionID, status: 'transaction-confirmed', txID : txID };
}

interface HeliusParsedTokenInputOutput {
    rawTokenAmount : DecimalizedAmount
    mint : string
}

export async function parseSwapTransaction(positionID : string, transactionResult : PreparseSwapResult, env : Env) : Promise<SwapResult> {
    
    const status = transactionResult.status;

    if (isTransactionPreparationFailure(status)) {
        return { positionID : positionID, status: status };
    }
    else if (isTransactionExecutionFailure(status)) {
        return { positionID : positionID, status: status };
    }
    else if (isTransactionConfirmationFailure(status)) {
        return { positionID : positionID, status: status, txID: transactionResult.txID };
    }

    const txID = transactionResult.txID!!;
    const parsedTransaction = await useJupiterAPIToParseSwapTransaction(txID, env);

    if (isTransactionParseFailure(parsedTransaction)) {
        return { positionID : positionID, status: parsedTransaction, txID : txID };
    }

    const summary = summarizeParsedSwapTransaction(parsedTransaction, env);

    if (isSwapExecutionError(summary)) {
        return { positionID : positionID, status: summary, txID : txID };
    }

    return { positionID : positionID, status: 'swap-successful', txID : txID, successfulSwapSummary: summary };
}

async function useJupiterAPIToParseSwapTransaction(txID : string, env : Env) : Promise<TransactionParseFailure|{ parsed: any }> {
    
    const url = `${env.V0_HELIUS_RPC_TRANSACTION_PARSING_URL}?api-key=${env.HELIUS_API_KEY}&commitment=finalized`
    
    const body = {
        "transactions": [txID]
    };

    const request = makeJSONRequest(url, body);
    const response = await fetch(request);   
    
    // Unauthorized
    if (response.status == 400) {
        return TransactionParseFailure.BadRequest;
    }
    else if (response.status == 401) {
        throw new Error("Failed to authenticate with HELIUS transaction parsing API")
    }
    // forbidden
    else if (response.status == 403) {
        return TransactionParseFailure.BadRequest;
    }
    // not found
    else if (response.status == 404) {
        return TransactionParseFailure.BadRequest;
    }
    // Rate-limited
    else if (response.status == 429) {
        return TransactionParseFailure.RateLimited;
    }   
    // helius internal error
    else if (response.status == 500) {
        return TransactionParseFailure.InternalError;
    }

    const datas = (await response.json()) as any[];

    return { 'parsed': datas[0] };
}

function summarizeParsedSwapTransaction(summarizeMe : { parsed: any }, env : Env) : SwapExecutionError|SuccessfulSwapSummary {

    const parsedTransaction = summarizeMe.parsed;

    if (parsedTransaction.transactionErr) {
        return parseTransactionError(parsedTransaction.transactionErr, env);
    }
    else {
        const swapEvent = parsedTransaction.events.swap;
        const tokenInputs = swapEvent.tokenInputs[0] as HeliusParsedTokenInputOutput;
        const tokenOutputs = swapEvent.tokenOutputs[0] as HeliusParsedTokenInputOutput;
        const decimalizedFees = parsedTransaction.fee as number;
        const solFee = decimalizedFees / getVsTokenDecimalsMultiplier('SOL')!!;
        const fillPrice = calculateFillPrice(tokenInputs, tokenOutputs);
        return {
            inTokenAddress : tokenInputs.mint,
            inTokenAmt : tokenInputs.rawTokenAmount,
            outTokenAddress: tokenOutputs.mint,
            outTokenAmt: tokenOutputs.rawTokenAmount,
            fees: solFee,
            fillPrice: fillPrice
        };
    }
}

function calculateFillPrice(tokenInput : HeliusParsedTokenInputOutput, tokenOutput : HeliusParsedTokenInputOutput) {
    return dDiv(tokenOutput.rawTokenAmount, tokenInput.rawTokenAmount, MATH_DECIMAL_PLACES)
}

function parseTransactionError(parsedTransaction : any, env : Env) : SwapExecutionError {
    const instructionErrorIndex      = parsedTransaction?.instructionError?.[0];
    const instructionErrorCustomCode = parsedTransaction?.instructionError?.[1]?.Custom;
    const programId = parsedTransaction.instructions?.[instructionErrorIndex]?.programId;
    const jupiter_swap_slippage_custom_error_code = parseInt(env.JUPITER_SWAP_PROGRAM_SLIPPAGE_ERROR_CODE, 10);
    if (programId === env.JUPITER_SWAP_PROGRAM_ID && instructionErrorCustomCode === jupiter_swap_slippage_custom_error_code) {
        return SwapExecutionError.SlippageToleranceExceeded;
    }
    // TODO: detect insufficient balance
    /*else if (programId === env.JUPITER_SWAP_PROGRAM_ID && instructionErrorCustomCode === jupiter_swap_insufficient_balance) {
        return 'insufficient-balance';
    }*/
    else {
        return SwapExecutionError.OtherError;
    }
}

interface HeliusParsedTokenTransfer {
    tokenAmount : number,
    mint : string
}

function isTransactionParseErrorHeliusResponse(obj: { error: string }|any[]) : obj is { error : string } {
    return obj && typeof obj === 'object' && "error" in obj;
}

function toSigner(wallet : Wallet) : Signer {
    const publicKey = new PublicKey(wallet.publicKey);
    const privateKey =  bs58.decode(wallet.privateKey);
    return {
        publicKey : publicKey,
        secretKey : privateKey
    };
}