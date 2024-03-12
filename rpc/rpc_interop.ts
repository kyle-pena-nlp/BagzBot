import { Env } from "../env";
import { makeJSONRequest, tryReadResponseBody } from "../util/http_helpers";
import { getVsTokenDecimalsMultiplier } from "../tokens/vs_tokens";
import { BlockhashWithExpiryBlockHeight, ConfirmOptions, Connection, PublicKey, SendOptions, SignatureStatus, Signer, TransactionConfirmationStrategy, VersionedTransaction, sendAndConfirmRawTransaction } from '@solana/web3.js';
import * as bs58 from "bs58";
import { Position, PositionRequest } from "../positions/positions";
import { Wallet } from "../crypto/wallet";
import { dDiv } from "../positions/decimalized_math";
import { DecimalizedAmount, MATH_DECIMAL_PLACES } from "../decimalized/decimalized_amount";
import { Buffer } from 'node:buffer';
import { sleep } from "../util/sleep";

// TODO: re-org this into a class, and have callbacks for different lifecycle elements.

/*
    Some thoughts:
        Implement retries.
        Split up into smaller methods and interleave code for handling stuff.
        Optimistically add positions and rollback if transaction is not confirmed.

*/

const JUPITER_REFERRAL_PROGRAM = "REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3";

/*
    These are chosen very carefully.
    When SwapMode is ExactOut, the platform fee is collected from the InToken of the swap
    And vice-versa for ExactIn.
    Because buys are SOL|USDC -> x, and sells are SOL|USDC -> x, 
    if we make buys ExactOut and sells ExactIn, then we only collect fees in SOL and USDC.
    That way, we don't have to convert a bunch of random sh**coins before they lose value,
    or create a bunch of random token accounts for the referral program.
*/
const JUPITER_BUY_TOKEN_SWAP_MODE = 'ExactOut';
const JUPITER_SELL_TOKEN_SWAP_MODE = 'ExactIn';

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

export interface PreparseSwapResult {
    positionID : string
    status: TransactionPreparationFailure|TransactionExecutionError|TransactionExecutionError|'transaction-confirmed'
    signature ?: string
}

export interface SwapResult {
    positionID : string
    status: TransactionPreparationFailure|TransactionExecutionError|TransactionParseFailure|SwapExecutionError|'swap-successful'
    signature ?: string
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


export enum TransactionParseFailure {
    BadRequest = "BadRequest",
    RateLimited = "RateLimited",
    UnknownTransaction = "UnknownTransaction",
    InternalError = "InternalError"
}

export enum SwapExecutionError {
    InsufficientBalance = "InsufficientBalance",
    SlippageToleranceExceeded = "SlippageToleranceExceeded",
    OtherSwapExecutionError = "OtherSwapExecutionError"
}


export interface SwapRoute {
    inTokenAddress : string,
    outTokenAddress : string,
    swapMode : 'ExactIn'|'ExactOut'
    route : object
};

export interface ConfirmationErr {
    err: {}|string
};


function isEnumValue<T extends Record<string,string|number>>(value: any, enumType: T): value is T[keyof T] {
    return Object.values(enumType).includes(value);
}


export function isTransactionPreparationFailure<T>(obj : T|TransactionPreparationFailure) : obj is TransactionPreparationFailure {
    return isEnumValue(obj, TransactionPreparationFailure);
    //return typeof obj === 'string' && obj != null && Object.values(obj).includes(TransactionPreparationFailure.FailedToDetermineSwapRoute);
}

export function isTransactionExecutionFailure<T>(obj : T|TransactionExecutionError) : obj is TransactionExecutionError {
    return isEnumValue(obj, TransactionExecutionError);
    //return typeof obj === 'string' && obj != null && (Object.values(TransactionExecutionError) as any[]).includes(obj);
}

export function isRetryableTransactionParseFailure<T>(obj : T | TransactionParseFailure) : obj is TransactionParseFailure.RateLimited|TransactionParseFailure.InternalError {
    return obj === TransactionParseFailure.RateLimited || obj === TransactionParseFailure.InternalError;
}

export function isTransactionParseFailure<T>(obj : T |TransactionParseFailure) : obj is TransactionParseFailure {
    return isEnumValue(obj, TransactionParseFailure);
    //return typeof obj === 'string' && obj != null && Object.values(obj).includes(TransactionParseFailure.BadRequest);
}

export function isSwapExecutionError<T>(obj: T | SwapExecutionError): obj is SwapExecutionError {
    return isEnumValue(obj, SwapExecutionError);
    //return typeof obj === 'string' && obj != null && Object.values(obj).includes(SwapExecutionError.OtherError);
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
        .then(rawSignedTxOrError => executeRawSignedTransaction(positionID, rawSignedTxOrError, env));
}

export async function sellToken(position : Position, wallet: Wallet, env : Env) : Promise<PreparseSwapResult> {
    const positionID = position.positionID;
    return getSellTokenSwapRoute(position, env) 
        .then(swapRoute => getRawSignedTransaction(swapRoute, wallet, env))
        .then(rawSignedTx => executeRawSignedTransaction(positionID, rawSignedTx, env));
}


async function getRawSignedTransaction(swapRoute : SwapRoute|TransactionPreparationFailure, wallet : Wallet, env : Env) : Promise<VersionedTransaction|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapRoute)) {
        return swapRoute;
    }
    return serializeSwapRouteTransaction(swapRoute, wallet.publicKey, env)
        .catch(reason => TransactionPreparationFailure.FailedToSerializeTransaction)
        .then(serializedSwapTransaction => signTransaction(serializedSwapTransaction, wallet, env))
}


export async function getSellTokenSwapRoute(position : Position, env : Env) : Promise<SwapRoute|TransactionPreparationFailure> {
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
        swapMode: JUPITER_SELL_TOKEN_SWAP_MODE
    };
    const quote_api_parameterized_url = makeJupiterQuoteAPIURL(quoteAPIParams, env);
    try {
        const quoteResponse = await fetch(quote_api_parameterized_url);
        if (!quoteResponse.ok) {
            return TransactionPreparationFailure.FailedToDetermineSwapRoute;
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
        return TransactionPreparationFailure.FailedToDetermineSwapRoute;
    }
}

// TODO: unify the buy/sell method somehow to reduce code duplication
async function getBuyTokenSwapRoute(positionRequest : PositionRequest, env : Env) : Promise<SwapRoute|TransactionPreparationFailure> {
    const vsTokenAddress = positionRequest.vsToken.address;
    const tokenAddress = positionRequest.token.address;
    const slippageBps = positionRequest.slippagePercent * 100;
    const vsTokenDecimalsMultiplier = getVsTokenDecimalsMultiplier(vsTokenAddress)!!;
    const decimalizedVsTokenAmount = (positionRequest.vsTokenAmt * vsTokenDecimalsMultiplier).toString();
    const platformFeeBps = parseInt(env.PLATFORM_FEE_BPS,10);
    const quoteAPIParams : JupiterQuoteAPIParams = {
        inputTokenAddress: vsTokenAddress, 
        outputTokenAddress: tokenAddress, 
        decimalizedAmount: decimalizedVsTokenAmount, 
        slippageBps: slippageBps, 
        platformFeeBps: platformFeeBps, 
        swapMode: JUPITER_BUY_TOKEN_SWAP_MODE 
    };
    const quote_api_parameterized_url = makeJupiterQuoteAPIURL(quoteAPIParams, env);
    try {
        const quoteResponse = await fetch(quote_api_parameterized_url);
        if (!quoteResponse.ok) {
            return TransactionPreparationFailure.FailedToDetermineSwapRoute;
        }
        const quoteResponseJSON = await quoteResponse.json();
        return { 
            inTokenAddress: quoteAPIParams.inputTokenAddress, 
            outTokenAddress: quoteAPIParams.outputTokenAddress, 
            swapMode: quoteAPIParams.swapMode,
            route: quoteResponseJSON as object
        };
    }
    catch (e : any) {
        return TransactionPreparationFailure.FailedToDetermineSwapRoute;
    }
}

interface JupiterQuoteAPIParams {
    inputTokenAddress : string,
    outputTokenAddress : string,
    decimalizedAmount : string,
    slippageBps: number,
    platformFeeBps : number,
    swapMode : 'ExactIn'|'ExactOut'
}

function makeJupiterQuoteAPIURL(params : JupiterQuoteAPIParams,
    env : Env) {
    // https://station.jup.ag/api-v6/get-quote
    return `${env.JUPITER_QUOTE_API_URL}?inputMint=${params.inputTokenAddress}\
&outputMint=${params.outputTokenAddress}\
&amount=${params.decimalizedAmount}\
&slippageBps=${params.slippageBps}\
&platformFeeBps=${params.platformFeeBps}\
&swapMode=${params.swapMode}`;
}

async function getFeeAccount(env : Env, swapRoute : SwapRoute) : Promise<PublicKey> {
    const referralAccountPubkey = new PublicKey(env.FEE_ACCOUNT_PUBLIC_KEY);
    const outputToken = getFeeAccountToken(swapRoute);
    const [feeAccount] = await PublicKey.findProgramAddressSync(
        [
          Buffer.from("referral_ata"),
          referralAccountPubkey.toBuffer(), // your referral account public key
          outputToken.toBuffer(), // the token mint
        ],
        new PublicKey(JUPITER_REFERRAL_PROGRAM) // the Referral Program
      );
    return feeAccount;
}

function getFeeAccountToken(swapRoute : SwapRoute) : PublicKey {
    switch(swapRoute.swapMode) {
        case 'ExactIn':
            return new PublicKey(swapRoute.outTokenAddress);
        case 'ExactOut':
            return new PublicKey(swapRoute.inTokenAddress);
    }
}

async function serializeSwapRouteTransaction(swapRoute : SwapRoute|TransactionPreparationFailure, publicKey : string, env : Env) : Promise<Buffer|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapRoute)) {
        return swapRoute;
    }
    const feeAccount = await getFeeAccount(env, swapRoute);
    const body = {
      quoteResponse: swapRoute.route,
      userPublicKey: publicKey,
      wrapAndUnwrapSol: true,
      feeAccount: feeAccount,
      computeUnitPriceMicroLamports: "auto"
    };
    try {
        const swapRequest = makeJSONRequest(env.JUPITER_SWAP_API_URL, body);
        const swapResponse = await fetch(swapRequest);
        if (!swapResponse.ok) {
            const responseBody = await tryReadResponseBody(swapResponse);
            return TransactionPreparationFailure.FailedToSerializeTransaction;
        }
        const swapRequestResponseJSON : any = await swapResponse.json();
        return Buffer.from(swapRequestResponseJSON.swapTransaction, 'base64'); 
    }
    catch (e) {
        return TransactionPreparationFailure.FailedToSerializeTransaction;
    }
}

async function signTransaction(swapTransaction : Buffer|TransactionPreparationFailure, wallet : Wallet, env : Env) : Promise<VersionedTransaction|TransactionPreparationFailure> {
    if (isTransactionPreparationFailure(swapTransaction)) {
        return swapTransaction;
    }
    try {
        var transaction = VersionedTransaction.deserialize(swapTransaction);
        // TODO: is this needed?
        transaction.message.recentBlockhash = await getRecentBlockhash(env);
        const signer = toSigner(wallet);
        transaction.sign([signer]);
        return transaction;
    }
    catch {
        return TransactionPreparationFailure.FailedToSignTransaction;
    }
}

async function getRecentBlockhash(env : Env) : Promise<string> {
    const connection = new Connection(env.RPC_ENDPOINT_URL);
    return (await connection.getLatestBlockhash('confirmed')).blockhash;
}

enum TransactionExecutionError {
    CouldNotPollBlockheight = "CouldNotPollBlockheight",
    BlockheightExceeded = "BlockheightExceeded",
    TransactionDropped = "TransactionDropped",
    TransactionFailed = "TransactionFailed",
    CouldNotConfirmTooManyExceptions = "CouldNotConfirmTooManyExceptions",
    TimeoutCouldNotConfirm = "TimeoutCouldNotConfirm",
    OtherError = "OtherError"
};

// TODO: https://solanacookbook.com/guides/retrying-transactions.html#customizing-rebroadcast-logic
async function executeRawSignedTransaction(
    positionID : string,
    rawSignedTx : VersionedTransaction|TransactionPreparationFailure, 
    env : Env,
    logHandler? : (msg: string, error : any) => Promise<void>) : Promise<PreparseSwapResult> {
    
    // no-op the logHandler if one is not provided
    if (logHandler == null) {
        logHandler = async (msg:string, error: any) => {};
    }

    // early-out if the tx is really just an error code
    if (isTransactionPreparationFailure(rawSignedTx)) {
        return { positionID : positionID, status: rawSignedTx };
    }
    
    // Define some settings
    const rpcSendTxMaxRetries = parseInt(env.EXECUTE_TRANSACTION_RPC_MAX_RETRIES,10);
    const maxConfirmExceptions = 10; // TODO: from env.
    const REBROADCAST_DELAY_MS = 300;
    const REATTEMPT_CONFIRM_DELAY = 300;
    const confirmTimeoutMS = 60 * 1000;

    // create cxn to RPC
    const connection = new Connection(env.RPC_ENDPOINT_URL);

    // transform tx to buffer, extract signature yo damn self
    const txBuffer = Buffer.from(rawSignedTx.serialize());
    const signature = bs58.encode(rawSignedTx.signatures[0]);
    
    /*
        We are going to set up two async loops ;
            One for resending the tx until blockheight exceeded
            One for confirming until timeout or signature not found and blockheight exceeded
    */

    // The loops can signal eachother to stop by setting these flags.
    let stopSendingSignal = false;
    let stopConfirmingSignal = false;

    // if the current blockheight exceeds this, the transaction will never execute.
    const lastValidBlockheight = await getLastValidBlockheight(connection);

    const resendTxTask = (async () => {

        // The current blockheight (will be repolled after every send attempt)
        let blockheight : number = -1;

        // Whether or not at least one tx got successfully sent to RPC
        let anyTxSent = false;
        
        // Until this loop is signalled to stop
        while(!stopSendingSignal) {

            /* Attempt to send transaction.  If sent, note that there is something to confirm. */
            try {
                await connection.sendRawTransaction(txBuffer, {
                    skipPreflight : true,
                    maxRetries: 0
                });
                anyTxSent = true;
            }
            catch(e) {
                await logHandler("sendRawTransaction threw an exception", e);
            }

            // Sleep to avoid spamming RPC.
            await sleep(REBROADCAST_DELAY_MS);

            /* 
                Poll the RPC for current blockheight.
                If polling for blockheight fails:
                    - Stop this loop. We must be able to poll for blockheight.
                    - Additionally, stop confirmTx loop if no sent transactions.
            */
            try {
                blockheight = await getLatestBlockheight(connection);
            }
            catch(e) {
                await logHandler("getBlockHeight threw an exception", e);
                if (!anyTxSent) {
                    stopConfirmingSignal = true;
                }
                return TransactionExecutionError.CouldNotPollBlockheight; // 'could-not-poll-blockheight';
            }

            /*
                If lastValidBlockheight exceeded, stop resending - it will never confirm or finalize.
                And if no tx ever sent successfully, signal confirmTx loop top stop trying to confirm.
            */
            if (blockheight >= lastValidBlockheight) {
                // If the current blockheight exceeds last valid blockheight, stop sending
                if (!anyTxSent) {
                    // and don't bother confirming if nothing was ever sent
                    stopConfirmingSignal = true;
                }
                return TransactionExecutionError.BlockheightExceeded;// 'transaction-blockheight-exceeded';
            }
        }
        return;
    })();

    /*
        Async loop: re-attempt confirmation until:
            (A) signature is confirmed or finalized
            (B) transaction itself has an error
            (C) send-transaction task tells us to stop trying to confirm
    */
    const confirmTransactionTask = (async () => {

        let confirmExceptions = 0;
        const startConfirmMS = Date.now();
        
        while(!stopConfirmingSignal) {
            
            /* Check the status on the signature */
            let result : SignatureStatus|null = null;
            try {
                
                // get signature status
                result = (await connection.getSignatureStatuses([signature], {
                    searchTransactionHistory: false
                })).value[0];

                // if the tx doesn't exist yet
                const txDoesNotExistYet = result == null;
                if (txDoesNotExistYet) {
                    // if tx DNE and blockheight exceeded, tx was dropped (TODO: is this certainly true?)
                    const currentBlockheight = await getLatestBlockheight(connection).catch((reason) => null);
                    if (currentBlockheight && (currentBlockheight > lastValidBlockheight)) {
                        await logHandler("No transaction found", {});
                        return TransactionExecutionError.TransactionDropped;// 'transaction-dropped';
                    }
                    if (!currentBlockheight) {
                        await logHandler('Could not poll currentBlockheight', {});
                    } 
                }
            }
            catch(e) {
                confirmExceptions++;
                await logHandler('getSignatureStatuses threw an exception', e);
            }

            /* If the transaction itself failed, exit confirmation loop with 'transaction-failed'. */
            const err = result?.err;
            if (err) {
                await logHandler("Transaction failed", err);
                stopSendingSignal = true;
                return TransactionExecutionError.TransactionFailed; // 'transaction-failed';
            }
            /* If the transaction itself was confirmed or finalized, exit confirmation loop with 'transaction-confirmed' */
            const status = result?.confirmationStatus;
            const hasConfirmations = (result?.confirmations || 0) > 0;
            if ((hasConfirmations || (status === 'confirmed' || status === 'finalized'))) {
                stopSendingSignal = true;
                return 'transaction-confirmed';
            }

            await sleep(REATTEMPT_CONFIRM_DELAY);

            /* i.e.; RPC is down. */
            if (confirmExceptions >= maxConfirmExceptions) {
                return TransactionExecutionError.CouldNotConfirmTooManyExceptions; //'confirmation-too-many-exceptions';
            }

            // this is a failsafe to prevent infinite looping.
            const confirmTimedOut = (Date.now() - startConfirmMS) > confirmTimeoutMS;
            if (confirmTimedOut) {
                stopSendingSignal = true;
                return TransactionExecutionError.TimeoutCouldNotConfirm;
            }
        }
        return;
    })();

    const confirmStatus = await confirmTransactionTask;
    const sendStatus = await resendTxTask;


    const finalStatus = determineTxConfirmationFinalStatus(sendStatus, confirmStatus);


    return { positionID : positionID, status: finalStatus, signature: signature };
}

function determineTxConfirmationFinalStatus(sendStatus : TransactionExecutionError|undefined, confirmStatus : TransactionExecutionError|'transaction-confirmed'|undefined) : TransactionExecutionError | 'transaction-confirmed' {
    return confirmStatus || sendStatus || TransactionExecutionError.OtherError;
}

async function getLatestBlockheight(connection : Connection) : Promise<number> {
    return (await connection.getBlockHeight());
}

async function getLastValidBlockheight(connection : Connection) {
    return (await connection.getLatestBlockhash('confirmed')).lastValidBlockHeight;
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

    const signature = transactionResult.signature!!;
    const parsedTransaction = await useJupiterAPIToParseSwapTransaction(signature, env);

    if (isTransactionParseFailure(parsedTransaction)) {
        return { positionID : positionID, status: parsedTransaction, signature : signature };
    }

    const summary = summarizeParsedSwapTransaction(parsedTransaction, env);

    if (isSwapExecutionError(summary)) {
        return { positionID : positionID, status: summary, signature : signature };
    }

    return { positionID : positionID, status: 'swap-successful', signature : signature, successfulSwapSummary: summary };
}

async function useJupiterAPIToParseSwapTransaction(signature : string, env : Env) : Promise<TransactionParseFailure|{ parsed: any }> {
    
    const url = `${env.V0_HELIUS_RPC_TRANSACTION_PARSING_URL}?api-key=${env.HELIUS_API_KEY}&commitment=confirmed`
    
    const body = {
        "transactions": [signature]
    };

    const request = makeJSONRequest(url, body);
    const response = await fetch(request).catch((reason) => {
        return null;
    });
    
    if (!response) {
        return TransactionParseFailure.BadRequest;
    }
    
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
        return SwapExecutionError.OtherSwapExecutionError;
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