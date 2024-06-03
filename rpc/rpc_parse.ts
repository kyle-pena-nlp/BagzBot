import { ParsedTransactionWithMeta, TokenBalance } from "@solana/web3.js";
import { UserAddress } from "../crypto";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, dDiv, dNegate, dSub, fromTokenAmount } from "../decimalized";
import { dZero } from "../decimalized/decimalized_amount";
import { Env } from "../env";
import { logError } from "../logging";
import { SOL_ADDRESS, deriveTokenAccount, getVsTokenInfo } from "../tokens";
import { safe } from "../util";
import { parseInstructionError } from "./rpc_parse_instruction_error";
import { ParsedSwapSummary, SwapSummary, UnknownTransactionParseSummary } from "./rpc_swap_parse_result_types";

// This may come in handy at some point: https://github.com/cocrafts/walless/blob/a05d20f8275c8167a26de976a3b6701d64472765/apps/wallet/src/engine/runners/solana/history/swapHistory.ts#L85
// REFERENCE: https://github.com/StrataFoundation/strata-data-pipelines/blob/b42b07152c378151bcc722eee73e3102d1087a93/src/event-transformer/transformers/tokenAccounts.ts#L34

export interface ParseTransactionParams {
    parsedTransaction : ParsedTransactionWithMeta
    inTokenAddress : string
    inTokenType : 'token'|'token-2022'
    outTokenAddress : string
    outTokenType : 'token'|'token-2022'
    signature : string
    userAddress : UserAddress
}

export function parseParsedTransactionWithMeta(params : ParseTransactionParams, env : Env) : Exclude<ParsedSwapSummary,UnknownTransactionParseSummary> {

    // if the tx has an error, early-out with the parsed error
    const err = params.parsedTransaction.meta?.err;
    if (err) {
        const logs = params.parsedTransaction.meta?.logMessages||[];
        const swapExecutionError = parseInstructionError(logs,err, env);
        return {
            status: swapExecutionError
        };
    }

    // get the position's token (these are horrible hacks to determine what kind of swap (buy vs sell), and i want to refactor all of this)
    const positionTokenAddress = params.inTokenAddress == SOL_ADDRESS ? params.outTokenAddress : params.inTokenAddress;
    const positionTokenType = params.inTokenAddress == SOL_ADDRESS ? params.outTokenType : params.inTokenType;

    const swapInTokenDiff = safe(dNegate)(calculateTokenBalanceChange(params.parsedTransaction, params.inTokenAddress, params.inTokenType, positionTokenAddress, positionTokenType, params.userAddress));
    const swapOutTokenDiff = calculateTokenBalanceChange(params.parsedTransaction, params.outTokenAddress, params.outTokenType, positionTokenAddress, positionTokenType, params.userAddress);

    if (swapInTokenDiff == null || swapOutTokenDiff == null) {
        throw new Error("Programmer error.");
    }

    // in / out <-> SOL / CHONKY <-> $$ / taco <-> taco costs $1.50
    const fillPrice = dDiv(swapInTokenDiff, swapOutTokenDiff, MATH_DECIMAL_PLACES) || dZero();

    const fees = params.parsedTransaction.meta?.fee || 0;

    const txSlot = params.parsedTransaction.slot;

    const swapTimeMS = params.parsedTransaction.blockTime||0;

    const swapSummary : SwapSummary = {
        inTokenAddress: params.inTokenAddress,
        inTokenAmt: swapInTokenDiff,
        outTokenAddress: params.outTokenAddress,
        outTokenAmt: swapOutTokenDiff,
        fees: fees,
        fillPrice: fillPrice,
        swapTimeMS: swapTimeMS,
        txSignature: params.signature,
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
    tokenType : 'token'|'token-2022',
    positionTokenAddress : string,
    positionTokenType : 'token'|'token-2022',
    userAddress : UserAddress) : DecimalizedAmount|null {
    if (tokenAddress === SOL_ADDRESS) {
        // SOL balance changes need to be calculated completely differently beacuse i am interested in amount spent, without fees
        return calculateNetSOLBalanceChangeExcludingFees(parsedTransaction, positionTokenAddress, positionTokenType, userAddress);
    }
    else {
        // it's much simpler when we aren't doing SOL
        return calculateNetTokenBalanceChange(parsedTransaction, tokenAddress, tokenType, userAddress)
    }
}

function calculateNetTokenBalanceChange(parsedTransaction : ParsedTransactionWithMeta,
    tokenAddress : string,
    splTokenType : 'token'|'token-2022',
    userAddress : UserAddress) : DecimalizedAmount|null {
    // TODO: check that innerInstructions are loaded, per: 
    // https://www.quicknode.com/docs/solana/getParsedTransaction
    // indicates that pre/post token balances only populated if inner instructions loaded

    const accountKeys = parsedTransaction.transaction.message.accountKeys.map(a => a.pubkey.toBase58());

    const preTokenBalances = parsedTransaction.meta?.preTokenBalances||[];
    const postTokenBalances = parsedTransaction.meta?.postTokenBalances||[];

    let preTokenBalance = findWithMintAndPubKey(preTokenBalances, accountKeys, tokenAddress, userAddress, splTokenType);
    let postTokenBalance = findWithMintAndPubKey(postTokenBalances, accountKeys, tokenAddress, userAddress, splTokenType);

    // no balances in pre- or post-... something fishy is going on
    if (preTokenBalance == null && postTokenBalance == null) {
        logError(`No balance for token ${tokenAddress} in either pre or postTokenBalances for ${parsedTransaction.transaction.signatures[0]} by ${userAddress}`);
        return null;
    }

    const preAmount = convertToTokenAmount(preTokenBalance);
    const postAmount = convertToTokenAmount(postTokenBalance);

    return dSub(postAmount,preAmount);    
}

function calculateNetSOLBalanceChangeExcludingFees(parsedTransaction : ParsedTransactionWithMeta, tokenAddress : string, tokenTokenType : 'token'|'token-2022', userAddress : UserAddress) : DecimalizedAmount|null {
    /* Here's the issue --- rent paid on new token accounts potentially needs to be taken into account,
    as well as fees.  So we need the position's token address to properly account for SOL balances diffs 
    So tokenAddress and tokenTokenType are indeed about the token, not the vsToken!
    */
    const tokenAccountAddress = deriveTokenAccount(tokenAddress, userAddress, tokenTokenType).toBase58();
    const mainAccountSOLBalanceDiff = calculateSolTokenBalanceDiff(parsedTransaction, userAddress.address);
    // rent
    const tokenAccountSOLBalanceDiff = calculateSolTokenBalanceDiff(parsedTransaction, tokenAccountAddress); 
    // fees charged (TODO: does this include platform fees on swap out?)
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

function findWithMintAndPubKey(tokenBalances : TokenBalance[], accountKeys : string[], tokenAddress : string, userAddress : UserAddress, type : 'token'|'token-2022') : (TokenBalance & { accountAddress : string })|undefined {
    const tokenAccountAddress = getTokenAccountAddress(tokenAddress, userAddress, type);
    const tokenBalance = tokenBalances
        .map(e => { 
            const t : TokenBalance & { accountAddress : string } = { ...e, accountAddress: accountKeys[e.accountIndex] }; 
            return t;
        })
        .find(e => (e.accountAddress === tokenAccountAddress) && (e.mint === tokenAddress));
    return tokenBalance;
}

function getTokenAccountAddress(tokenAddress : string, userAddress : UserAddress, type : 'token'|'token-2022') : string {
    const tokenAccountAddress = deriveTokenAccount(tokenAddress, userAddress, type).toBase58();
    return tokenAccountAddress;
}



