import { Connection, ParsedInstruction, ParsedTransactionWithMeta, TokenBalance, TransactionError } from "@solana/web3.js";
import { PreparseConfirmedSwapResult, PreparseSwapResult, SwapSummary, UnknownTransactionParseSummary, SwapExecutionError, ParsedSwapSummary } from "./rpc_types";
import { MATH_DECIMAL_PLACES, fromTokenAmount } from "../decimalized/decimalized_amount";
import { dDiv, dSub } from "../decimalized/decimalized_math";
import { Env } from "../env";
import { Position, PositionRequest, Swappable, isPosition, isPositionRequest } from "../positions/positions";
import { getLastValidBlockheight } from "./rpc_common";
import { sleep } from "../util/sleep";
import { TokenInfo } from "../tokens/token_info";

// This may come in handy at some point: https://github.com/cocrafts/walless/blob/a05d20f8275c8167a26de976a3b6701d64472765/apps/wallet/src/engine/runners/solana/history/swapHistory.ts#L85

export async function parseBuySwapTransaction(positionRequest : PositionRequest, 
    preparseSwapResult : PreparseConfirmedSwapResult, 
    connection : Connection, 
    env : Env) : Promise<ParsedSwapSummary> {
    
    return await implParseSwapTransaction(preparseSwapResult.signature,
        positionRequest.vsToken.address,
        positionRequest.token.address,
        connection,
        env);
}

export async function parseSellSwapTransaction(position : Position,
        preparseSwapResult : PreparseSwapResult,
        connection : Connection,
        env : Env) : Promise<ParsedSwapSummary> {

    return await implParseSwapTransaction(
        preparseSwapResult.signature,
        position.token.address,
        position.vsToken.address,
        connection,
        env);    
}

async function implParseSwapTransaction(
    signature : string, 
    inTokenAddress : string, 
    outTokenAddress : string, 
    connection : Connection,
    env : Env) : Promise<ParsedSwapSummary> {
    
    const parsedTransaction = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
    });

    if (!parsedTransaction) {
        return {  
            status: 'unknown-transaction'
        };
    }

    const meta = parsedTransaction.meta;

    const preTxTokenBalances = (meta?.preTokenBalances||[]);
    const postTxTokenBalances = (meta?.postTokenBalances||[]);
    
    const isToken = (address : string) => { return (balance : TokenBalance) => { balance.mint === address }};
    const getTokenAmt = (tokenBalances : TokenBalance[], address : string) => fromTokenAmount(tokenBalances.find(isToken(address))?.uiTokenAmount!!);
    
    const inTokenPreAmt = getTokenAmt(preTxTokenBalances, inTokenAddress);
    const inTokenPostAmt = getTokenAmt(postTxTokenBalances, inTokenAddress);
    const outTokenPreAmt = getTokenAmt(preTxTokenBalances, outTokenAddress);
    const outTokenPostAmt = getTokenAmt(postTxTokenBalances, outTokenAddress); 

    const spentAmt = dSub(inTokenPostAmt, inTokenPreAmt);
    const receivedAmt = dSub(outTokenPostAmt, outTokenPreAmt);
    const fillPrice = dDiv(receivedAmt, spentAmt, MATH_DECIMAL_PLACES);

    const fees = meta?.fee || 0;

    const err = meta?.err;
    if (err) {
        const swapExecutionError = determineSwapExecutionError(parsedTransaction, env);
        return {
            status: swapExecutionError
        }
    }

    const swapSummary : SwapSummary = {
        inTokenAddress: inTokenAddress,
        inTokenAmt: spentAmt,
        outTokenAddress: outTokenAddress,
        outTokenAmt: receivedAmt,
        fees: fees,
        fillPrice: fillPrice
    };

    const swapResult : ParsedSwapSummary = {
        status : 'swap-successful',
        swapSummary: swapSummary
    };

    return swapResult;
}

export async function waitForBlockFinalizationAndParseBuy(
    positionRequest: Swappable, 
    signature : string, 
    connection : Connection, 
    env : Env) : Promise<ParsedSwapSummary> {
    if (isPositionRequest(positionRequest)) {

    }
    else {

    }
    const inTokenAddress = positionRequest.vsToken.address;
    const outTokenAddress = positionRequest.token.address;
    return waitForBlockFinalizationAndParse(signature, inTokenAddress, outTokenAddress, connection, env);
}



export async function waitForBlockFinalizationAndParseSell(
    position: Position, 
    signature : string, 
    connection : Connection, 
    env : Env) : Promise<ParsedSwapSummary> {
    const inTokenAddress = position.token.address;
    const outTokenAddress = position.vsToken.address;
    return waitForBlockFinalizationAndParse(signature, inTokenAddress, outTokenAddress, connection, env);
}


async function waitForBlockFinalizationAndParse(signature : string, 
    inTokenAddress : string, 
    outTokenAddress : string, 
    connection : Connection,
    env : Env) : Promise<ParsedSwapSummary> {

    await waitUntilCurrentBlockFinalized(connection, env);

    return implParseSwapTransaction(signature, inTokenAddress, outTokenAddress, connection, env);
}

async function waitUntilCurrentBlockFinalized(connection : Connection, env : Env) {
    try {
        const currentSlot = await connection.getSlot('confirmed');
        let finalizedSlot = await connection.getSlot('finalized');
        while(currentSlot > finalizedSlot) {
            sleep(10000);
            finalizedSlot = await connection.getSlot('finalized');
        }
        return;
    }
    catch(e) {
        // What else can I do...
        sleep(2 * parseInt(env.MAX_BLOCK_FINALIZATION_TIME_MS, 10));
        return;
    }
}

function determineSwapExecutionError(parsedTransaction : ParsedTransactionWithMeta, env : Env) : SwapExecutionError {
    //const instructions = parsedTransaction.transaction.message.instructions;
    //parsedTransaction.meta?.innerInstructions
    return SwapExecutionError.OtherSwapExecutionError; // TODO: detect actual error cases by code, etc.
    
    /*const instructionErrorIndex      = parsedTransaction.instructionError?.[0];
    const instructionErrorCustomCode = parsedTransaction.instructionError?.[1]?.Custom;
    const programId = parsedTransaction.instructions.[instructionErrorIndex]?.programId;
    const jupiter_swap_slippage_custom_error_code = parseInt(env.JUPITER_SWAP_PROGRAM_SLIPPAGE_ERROR_CODE, 10);
    if (programId === env.JUPITER_SWAP_PROGRAM_ID && instructionErrorCustomCode === jupiter_swap_slippage_custom_error_code) {
        return SwapExecutionError.SlippageToleranceExceeded;
    }*/
    // TODO: detect insufficient balance
    /*else if (programId === env.JUPITER_SWAP_PROGRAM_ID && instructionErrorCustomCode === jupiter_swap_insufficient_balance) {
        return 'insufficient-balance';
    }*/
    /*
    else {
        return SwapExecutionError.OtherSwapExecutionError;
    }*/
}