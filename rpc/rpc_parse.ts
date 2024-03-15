import { Connection, ParsedTransactionWithMeta, TokenBalance } from "@solana/web3.js";
import { PreparseConfirmedSwapResult, PreparseSwapResult, SwapSummary, SwapExecutionError, ParsedSwapSummary } from "./rpc_types";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, fromTokenAmount } from "../decimalized/decimalized_amount";
import { dDiv, dNegate, dSub } from "../decimalized/decimalized_math";
import { Env } from "../env";
import { Position, PositionRequest, Swappable, isPosition, isPositionRequest } from "../positions/positions";
import { sleep } from "../util/sleep";
import { UserAddress } from "../crypto/wallet";
import { safe } from "../util/safe";


// This may come in handy at some point: https://github.com/cocrafts/walless/blob/a05d20f8275c8167a26de976a3b6701d64472765/apps/wallet/src/engine/runners/solana/history/swapHistory.ts#L85

export async function parseBuySwapTransaction(positionRequest : PositionRequest, 
    preparseSwapResult : PreparseConfirmedSwapResult,
    userAddress : UserAddress, 
    connection : Connection, 
    env : Env) : Promise<ParsedSwapSummary> {
    
    return await parseSwapTransaction(preparseSwapResult.signature,
        positionRequest.vsToken.address,
        positionRequest.token.address,
        userAddress,
        connection,
        env);
}

export async function parseSellSwapTransaction(position : Position,
        preparseSwapResult : PreparseSwapResult,
        userAddress : UserAddress,
        connection : Connection,
        env : Env) : Promise<ParsedSwapSummary> {

    return await parseSwapTransaction(
        preparseSwapResult.signature,
        position.token.address,
        position.vsToken.address,
        userAddress,
        connection,
        env);    
}

// REFERENCE: https://github.com/StrataFoundation/strata-data-pipelines/blob/b42b07152c378151bcc722eee73e3102d1087a93/src/event-transformer/transformers/tokenAccounts.ts#L34
async function parseSwapTransaction(
    signature : string, 
    inTokenAddress : string, 
    outTokenAddress : string, 
    userAddress : UserAddress,
    connection : Connection,
    env : Env) : Promise<ParsedSwapSummary> {
    
    const parsedTransaction = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
    }).catch(r => null);

    if (!parsedTransaction) {
        return {  
            status: 'unknown-transaction'
        };
    }

    const err = parsedTransaction.meta?.err;
    if (err) {
        const swapExecutionError = determineSwapExecutionError(parsedTransaction, env);
        return {
            status: swapExecutionError
        }
    }    

    const swapInTokenDiff = safe(dNegate)(calculateTokenBalanceChange(parsedTransaction, inTokenAddress, userAddress));
    const swapOutTokenDiff = calculateTokenBalanceChange(parsedTransaction, outTokenAddress, userAddress);

    if (swapInTokenDiff == null || swapOutTokenDiff == null) {
        throw new Error("Programmer error.");
    }

    const fillPrice = dDiv(swapOutTokenDiff, swapInTokenDiff, MATH_DECIMAL_PLACES);

    const fees = parsedTransaction.meta?.fee || 0;

    const swapSummary : SwapSummary = {
        inTokenAddress: inTokenAddress,
        inTokenAmt: swapInTokenDiff,
        outTokenAddress: outTokenAddress,
        outTokenAmt: swapOutTokenDiff,
        fees: fees,
        fillPrice: fillPrice
    };

    const swapResult : ParsedSwapSummary = {
        status : 'swap-successful',
        swapSummary: swapSummary
    };

    return swapResult;
}

function calculateTokenBalanceChange(parsedTransaction : ParsedTransactionWithMeta, 
    tokenAddress : string, 
    userAddress : UserAddress) : DecimalizedAmount|null {
    const preTokenBalances = parsedTransaction.meta?.preTokenBalances||[];
    const postTokenBalances = parsedTransaction.meta?.postTokenBalances||[];
    const accountKeys = parsedTransaction.transaction.message.accountKeys.map(a => a.pubkey.toBase58());
    //const accountKeys = (parsedTransaction.meta?.loadedAddresses?.writable||[]).map(a => a.toBase58());

    const preTokenBalance = findWithMintAndPubKey(preTokenBalances, accountKeys, tokenAddress, userAddress);
    const postTokenBalance = findWithMintAndPubKey(postTokenBalances, accountKeys, tokenAddress, userAddress);

    if (preTokenBalance == null || postTokenBalance == null) {
        return null;
    }

    const preAmount = fromTokenAmount(preTokenBalance.uiTokenAmount);
    const postAmount = fromTokenAmount(postTokenBalance.uiTokenAmount);

    return dSub(postAmount,preAmount);
}

function findWithMintAndPubKey(tokenBalances : TokenBalance[], accountKeys : string[], tokenAddress : string, userAddress : UserAddress) {
    const tokenBalance = tokenBalances
        .map(e => { return { ...e, address: accountKeys[e.accountIndex] } })
        .find(e => (e.address === userAddress.address) && (e.mint === tokenAddress));
    return tokenBalance;
}

export async function waitForBlockFinalizationAndParse(s : Swappable,
    signature : string,
    userAddress : UserAddress,
    connection : Connection,
    env : Env) : Promise<ParsedSwapSummary> {
        await waitUntilCurrentBlockFinalized(connection, env);
        if (isPositionRequest(s)) {
            return parseSwapTransaction(signature, s.vsToken.address, s.token.address, userAddress, connection, env);
        }
        else if (isPosition(s)) {
            return parseSwapTransaction(signature, s.token.address, s.vsToken.address, userAddress, connection, env);
        }
        else {
            throw new Error("Programmer error.");
        }
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