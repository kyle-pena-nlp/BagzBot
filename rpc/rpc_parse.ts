import { Connection, ParsedTransactionWithMeta, TokenBalance } from "@solana/web3.js";
import { UserAddress } from "../crypto";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, dAdd, dDiv, dNegate, dSub, fromTokenAmount } from "../decimalized";
import { Env } from "../env";
import { logError } from "../logging";
import { Position, PositionRequest, Swappable, isPosition, isPositionRequest } from "../positions";
import { SOL_ADDRESS, deriveTokenAccount, getVsTokenInfo } from "../tokens";
import { safe, sleep } from "../util";
import { parseInstructionError } from "./rpc_parse_instruction_error";
import { ParsedSwapSummary, PreparseConfirmedSwapResult, PreparseSwapResult, SwapSummary } from "./rpc_types";


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
    }).catch(r => {
        logError("Hard error retrieving parsed transaction", userAddress, { signature : signature }, r);
        return null;
    });

    if (!parsedTransaction) {
        return {  
            status: 'unknown-transaction'
        };
    }

    const err = parsedTransaction.meta?.err;
    if (err) {
        const swapExecutionError = parseInstructionError(err, env);
        return {
            status: swapExecutionError
        };
    }    

    const swapOutTokenDiff = calculateTokenBalanceChange(parsedTransaction, outTokenAddress, userAddress);
    const swapInTokenDiff = safe(dNegate)(calculateTokenBalanceChange(parsedTransaction, inTokenAddress, userAddress));

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
    // depending on whether we are dealing with SOL, we look in different places.
    if (tokenAddress === SOL_ADDRESS) {
        const ownerAccountIdx = accountKeys.indexOf(userAddress.address);
        const preSOLBalances = parsedTransaction.meta?.preBalances;
        const postSOLBalances = parsedTransaction.meta?.postBalances;
        const rawPreSolAmount = preSOLBalances?.[ownerAccountIdx];
        const rawPostSolAmount = postSOLBalances?.[ownerAccountIdx];
        if (rawPreSolAmount == null || rawPostSolAmount == null) {
            logError("Could not find pre/post SOL balances", userAddress, parsedTransaction.transaction.signatures[0]);
            return null;
        }
        const solDecimals = getVsTokenInfo('SOL').decimals;
        const preSOLDecimalized : DecimalizedAmount = { 
            tokenAmount: rawPreSolAmount.toString(),
            decimals : solDecimals 
        };
        const postSOLDecimalized : DecimalizedAmount = {
            tokenAmount : rawPostSolAmount.toString(),
            decimals: solDecimals
        };
        const solBalanceDiff = dSub(postSOLDecimalized,preSOLDecimalized);

        // sadly, the pre/post amount for SOL doesn't seem to exclude fees, so we do that here.
        const solFees = parsedTransaction.meta?.fee||0;
        const solFeeDecimalized : DecimalizedAmount = {
            tokenAmount: solFees.toString(),
            decimals : solDecimals
        }
        return dAdd(solBalanceDiff, solFeeDecimalized);
    }
    else {
        const preTokenBalance = findWithMintAndPubKey(preTokenBalances, accountKeys, tokenAddress, userAddress);
        const postTokenBalance = findWithMintAndPubKey(postTokenBalances, accountKeys, tokenAddress, userAddress);
    
        if (preTokenBalance == null || postTokenBalance == null) {
            return null;
        }
    
        const preAmount = fromTokenAmount(preTokenBalance.uiTokenAmount);
        const postAmount = fromTokenAmount(postTokenBalance.uiTokenAmount);
    
        return dSub(postAmount,preAmount);
    }
}

function findWithMintAndPubKey(tokenBalances : TokenBalance[], accountKeys : string[], tokenAddress : string, userAddress : UserAddress) {
    
    const tokenAccountAddress = getTokenAccountAddress(tokenAddress, userAddress);
    const tokenBalance = tokenBalances
        .map(e => { return { ...e, accountAddress: accountKeys[e.accountIndex] }; })
        .find(e => (e.accountAddress === tokenAccountAddress) && (e.mint === tokenAddress));
    return tokenBalance;
}

function getTokenAccountAddress(tokenAddress : string, userAddress : UserAddress) : string {
    const tokenAccountAddress = deriveTokenAccount(tokenAddress, userAddress).toBase58();
    return tokenAccountAddress;
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