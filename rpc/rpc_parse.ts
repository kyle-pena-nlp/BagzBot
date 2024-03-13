import { Connection, ParsedInstruction, ParsedTransactionWithMeta, TokenBalance, TransactionError } from "@solana/web3.js";
import { PreparseSwapResult, SuccessfulSwapSummary, SwapExecutionError, SwapResult, TransactionParseFailure } from "./rpc_types";
import { MATH_DECIMAL_PLACES, fromTokenAmount } from "../decimalized/decimalized_amount";
import { dDiv, dSub } from "../decimalized/decimalized_math";
import { Env } from "../env";
import { Position, PositionRequest } from "../positions/positions";

// This may come in handy at some point: https://github.com/cocrafts/walless/blob/a05d20f8275c8167a26de976a3b6701d64472765/apps/wallet/src/engine/runners/solana/history/swapHistory.ts#L85

export async function parseBuySwapTransaction(positionRequest : PositionRequest, 
    preparseSwapResult : PreparseSwapResult, 
    connection : Connection, 
    env : Env) : Promise<SwapResult> {
    
    if (preparseSwapResult.status !== 'transaction-confirmed') {
        return {
            positionID : preparseSwapResult.positionID,
            signature : preparseSwapResult.signature,
            status: preparseSwapResult.status
        };
    }
    return await implParseSwapTransaction(preparseSwapResult.positionID, 
        preparseSwapResult.signature!!,
        positionRequest.vsToken.address,
        positionRequest.token.address,
        connection,
        env)
}

export async function parseSellSwapTransaction(position : Position,
        preparseSwapResult : PreparseSwapResult,
        connection : Connection,
        env : Env) : Promise<SwapResult> {
    
    if (preparseSwapResult.status !== 'transaction-confirmed') {
        return {
            positionID : preparseSwapResult.positionID,
            signature : preparseSwapResult.signature,
            status: preparseSwapResult.status
        };
    }

    return await implParseSwapTransaction(preparseSwapResult.positionID, 
        preparseSwapResult.signature!!,
        position.token.address,
        position.vsToken.address,
        connection,
        env);    
}

async function implParseSwapTransaction(
    positionID : string,
    signature : string, 
    inTokenAddress : string, 
    outTokenAddress : string, 
    connection : Connection,
    env : Env) : Promise<SwapResult> {
    
    const parsedTransaction = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
    });

    if (!parsedTransaction) {
        return { 
            positionID : positionID, 
            signature: signature, 
            status: TransactionParseFailure.UnknownTransaction
        };
    }

    const meta = parsedTransaction.meta;

    const preTxTokenBalances = (meta?.preTokenBalances||[]);
    const postTxTokenBalances = (meta?.postTokenBalances||[]);
    
    const isToken = (address : string) => { return (balance : TokenBalance) => { balance.mint === address }};
    const getTokenAmt = (tokenBalances : TokenBalance[], address : string) => fromTokenAmount(tokenBalances.find(isToken(address))?.uiTokenAmount);
    
    const inTokenPreAmt = getTokenAmt(preTxTokenBalances, inTokenAddress);
    const inTokenPostAmt = getTokenAmt(postTxTokenBalances, inTokenAddress);
    const outTokenPreAmt = getTokenAmt(preTxTokenBalances, outTokenAddress);
    const outTokenPostAmt = getTokenAmt(postTxTokenBalances, outTokenAddress); 
    if (!inTokenPreAmt || !inTokenPostAmt || !outTokenPreAmt || !outTokenPostAmt) {
        return { 
            positionID : positionID, 
            signature: signature, 
            status: TransactionParseFailure.CouldNotDetermineAmountsSpent
        };
    }
    
    const spentAmt = dSub(inTokenPostAmt, inTokenPreAmt);
    const receivedAmt = dSub(outTokenPostAmt, outTokenPreAmt);
    const fillPrice = dDiv(receivedAmt, spentAmt, MATH_DECIMAL_PLACES);

    const fees = meta?.fee || 0;

    const err = meta?.err;
    if (err) {
        const swapExecutionError = determineSwapExecutionError(parsedTransaction, env);
        return {
            positionID : positionID,
            signature: signature,
            status: swapExecutionError
        }
    }

    const successfulSwapSummary : SuccessfulSwapSummary = {
        inTokenAddress: inTokenAddress,
        inTokenAmt: spentAmt,
        outTokenAddress: outTokenAddress,
        outTokenAmt: receivedAmt,
        fees: fees,
        fillPrice: fillPrice
    };

    const swapResult : SwapResult = {
        positionID : positionID,
        status : 'swap-successful',
        signature: signature,
        successfulSwapSummary: successfulSwapSummary
    };

    return swapResult;

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