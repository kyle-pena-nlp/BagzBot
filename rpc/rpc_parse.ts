import { Connection, ParsedTransactionWithMeta, TokenBalance } from "@solana/web3.js";
import { UserAddress } from "../crypto";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, dDiv, dNegate, dSub, fromTokenAmount } from "../decimalized";
import { dZero } from "../decimalized/decimalized_amount";
import { Env } from "../env";
import { logDebug, logError } from "../logging";
import { Position, PositionRequest } from "../positions";
import { SOL_ADDRESS, deriveTokenAccount, getVsTokenInfo } from "../tokens";
import { safe, sleep } from "../util";
import { assertIs } from "../util/enums";
import { parseInstructionError } from "./rpc_parse_instruction_error";
import { ParsedSuccessfulSwapSummary, ParsedSwapSummary, PreparseConfirmedSwapResult, PreparseSwapResult, SwapExecutionErrorParseSummary, SwapSummary } from "./rpc_types";

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

type ParsedTx = ParsedTransactionWithMeta | 'tx-DNE' | 'error-retrieving-tx';

// REFERENCE: https://github.com/StrataFoundation/strata-data-pipelines/blob/b42b07152c378151bcc722eee73e3102d1087a93/src/event-transformer/transformers/tokenAccounts.ts#L34
export async function parseSwapTransaction(
    signature : string, 
    inTokenAddress : string, 
    outTokenAddress : string, 
    userAddress : UserAddress,
    connection : Connection,
    env : Env) : Promise<ParsedSwapSummary> {

    // this is a really hacky retry loop... i'm running short on time.  
    // i will do a proper blockheight based poll later.
    // todo: enforce that any usage of this method is with a tx with a confirmed signature
    // todo: pass along lastValidBlockheight
    let parsedTransaction : ParsedTx = 'tx-DNE';
    let parseAttempts = 0;
    while (parsedTransaction === 'tx-DNE') {
        logDebug(`Attempting confirm of tx ${signature}`);
        parsedTransaction = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        })
        .then(tx => tx == null ? 'tx-DNE' : tx)
        .catch(r => 'error-retrieving-tx');
        sleep(500);
        if (parseAttempts > 10) {
            break;
        }
    }

    if (parsedTransaction == 'tx-DNE') {
        logError("Could not find tx", userAddress, { signature : signature });
        return {  
            status: 'unknown-transaction'
        };
    }

    if (parsedTransaction === 'error-retrieving-tx') {
        logError("Hard error retrieving parsed transaction", userAddress, { signature : signature });
        return {
            status : 'unknown-transaction'
        }
    }

    assertIs<ParsedTransactionWithMeta,typeof parsedTransaction>();

    return parseParsedTransactionWithMeta(parsedTransaction, inTokenAddress, outTokenAddress, signature, userAddress, env);
}

export function parseSwappableParsedTransactionWithMeta(position : Position, parsedTransaction : ParsedTransactionWithMeta, type : 'buy'|'sell', userAddress : UserAddress, env : Env) {
    const inTokenAddress = { 'buy': position.vsToken.address, 'sell': position.token.address }[type];
    const outTokenAddress = { 'buy': position.token.address, 'sell': position.vsToken.address }[type];
    const signature = { 'buy': position.txBuySignature, 'sell': position.txSellSignature }[type];
    if (signature == null) {
        return null;
    }
    return parseParsedTransactionWithMeta(parsedTransaction, inTokenAddress, outTokenAddress, signature, userAddress, env);
}

export function parseParsedTransactionWithMeta(parsedTransaction : ParsedTransactionWithMeta, inTokenAddress : string, outTokenAddress : string, signature : string, userAddress : UserAddress, env : Env) : ParsedSuccessfulSwapSummary|SwapExecutionErrorParseSummary {

    const err = parsedTransaction.meta?.err;
    if (err) {
        const swapExecutionError = parseInstructionError(err, env);
        return {
            status: swapExecutionError
        };
    }    

    // another horrible hack.
    const positionTokenAddress = inTokenAddress == SOL_ADDRESS ? outTokenAddress : inTokenAddress;

    const swapInTokenDiff = safe(dNegate)(calculateTokenBalanceChange(parsedTransaction, inTokenAddress, positionTokenAddress, userAddress));
    const swapOutTokenDiff = calculateTokenBalanceChange(parsedTransaction, outTokenAddress, positionTokenAddress, userAddress);

    if (swapInTokenDiff == null || swapOutTokenDiff == null) {
        throw new Error("Programmer error.");
    }

    // in / out <-> SOL / CHONKY <-> $$ / taco <-> taco costs $1.50
    const fillPrice = dDiv(swapInTokenDiff, swapOutTokenDiff, MATH_DECIMAL_PLACES) || dZero();

    const fees = parsedTransaction.meta?.fee || 0;

    const txSlot = parsedTransaction.slot;

    const swapTimeMS = parsedTransaction.blockTime||0;

    const swapSummary : SwapSummary = {
        inTokenAddress: inTokenAddress,
        inTokenAmt: swapInTokenDiff,
        outTokenAddress: outTokenAddress,
        outTokenAmt: swapOutTokenDiff,
        fees: fees,
        fillPrice: fillPrice,
        swapTimeMS: swapTimeMS,
        txSignature: signature,
        txSlot: txSlot
    };

    const swapResult : ParsedSwapSummary = {
        status : 'swap-successful',
        swapSummary: swapSummary
    };

    return swapResult;
}

function calculateTokenBalanceChange(parsedTransaction : ParsedTransactionWithMeta, 
    tokenAddress : string, 
    positionTokenAddress : string,
    userAddress : UserAddress) : DecimalizedAmount|null {
    if (tokenAddress === SOL_ADDRESS) {
        return calculateNetSOLBalanceChange(parsedTransaction, positionTokenAddress, userAddress);
    }
    else {
        return calculateNetTokenBalanceChange(parsedTransaction, tokenAddress, userAddress)
    }
}

function calculateNetTokenBalanceChange(parsedTransaction : ParsedTransactionWithMeta,
    tokenAddress : string,
    userAddress : UserAddress) : DecimalizedAmount|null {
    // TODO: check that innerInstructions are loaded, per: 
    // https://www.quicknode.com/docs/solana/getParsedTransaction
    // indicates that pre/post token balances only populated if inner instructions loaded

    const accountKeys = parsedTransaction.transaction.message.accountKeys.map(a => a.pubkey.toBase58());

    const preTokenBalances = parsedTransaction.meta?.preTokenBalances||[];
    const postTokenBalances = parsedTransaction.meta?.postTokenBalances||[];

    let preTokenBalance = findWithMintAndPubKey(preTokenBalances, accountKeys, tokenAddress, userAddress);
    let postTokenBalance = findWithMintAndPubKey(postTokenBalances, accountKeys, tokenAddress, userAddress);

    // no balances in pre- or post-... something fishy is going on
    if (preTokenBalance == null && postTokenBalance == null) {
        logError(`No balance for token ${tokenAddress} in either pre or postTokenBalances for ${parsedTransaction.transaction.signatures[0]} by ${userAddress}`);
        return null;
    }

    const preAmount = convertToTokenAmount(preTokenBalance);
    const postAmount = convertToTokenAmount(postTokenBalance);

    return dSub(postAmount,preAmount);    
}

function calculateNetSOLBalanceChange(parsedTransaction : ParsedTransactionWithMeta, tokenAddress : string, userAddress : UserAddress) : DecimalizedAmount|null {
    /* Here's the issue --- rent paid on new token accounts potentially needs to be taken into account,
    as well as fees.  So we need the position's token address to properly account for SOL balances diffs */
    const tokenAccountAddress = deriveTokenAccount(tokenAddress, userAddress).toBase58();
    const mainAccountSOLBalanceDiff = calculateSolTokenBalanceDiff(parsedTransaction, userAddress.address);
    const tokenAccountSOLBalanceDiff = calculateSolTokenBalanceDiff(parsedTransaction, tokenAccountAddress); 
    const solFees = parsedTransaction.meta?.fee||0;
    const netSOLDifference = mainAccountSOLBalanceDiff + tokenAccountSOLBalanceDiff + solFees;
    return {
        tokenAmount: netSOLDifference.toString(),
        decimals: getVsTokenInfo('SOL').decimals 
    };
}

function calculateSolTokenBalanceDiff(parsedTransaction : ParsedTransactionWithMeta, address : string) : number {
    const accountKeys = parsedTransaction.transaction.message.accountKeys.map(a => a.pubkey.toBase58());
    const addressAccountIdx = accountKeys.indexOf(address);
    const preSOLBalances = parsedTransaction.meta?.preBalances;
    const postSOLBalances = parsedTransaction.meta?.postBalances;    
    const preBalance = preSOLBalances?.[addressAccountIdx]||0.0;
    const postBalance = postSOLBalances?.[addressAccountIdx]||0.0;
    return postBalance - preBalance;
}

function convertToTokenAmount(tokenBalance : (TokenBalance & {accountAddress : string })|undefined) {
    // if the token isn't found in the balances list, assume it is zero balance.
    if (tokenBalance == null) {
        return dZero();
    }
    else {
        return fromTokenAmount(tokenBalance.uiTokenAmount);
    }
}

function findWithMintAndPubKey(tokenBalances : TokenBalance[], accountKeys : string[], tokenAddress : string, userAddress : UserAddress) : (TokenBalance & { accountAddress : string })|undefined {
    const tokenAccountAddress = getTokenAccountAddress(tokenAddress, userAddress);
    const tokenBalance = tokenBalances
        .map(e => { 
            const t : TokenBalance & { accountAddress : string } = { ...e, accountAddress: accountKeys[e.accountIndex] }; 
            return t;
        })
        .find(e => (e.accountAddress === tokenAccountAddress) && (e.mint === tokenAddress));
    return tokenBalance;
}

function getTokenAccountAddress(tokenAddress : string, userAddress : UserAddress) : string {
    const tokenAccountAddress = deriveTokenAccount(tokenAddress, userAddress).toBase58();
    return tokenAccountAddress;
}



