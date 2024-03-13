import { MATH_DECIMAL_PLACES } from "../decimalized/decimalized_amount";
import { dDiv } from "../decimalized/decimalized_math";
import { Env } from "../env";
import { getVsTokenDecimalsMultiplier } from "../tokens/vs_tokens";
import { makeJSONRequest } from "../util/http_helpers";
import { HeliusParsedTokenInputOutput, PreparseSwapResult, SuccessfulSwapSummary, SwapExecutionError, SwapResult, TransactionParseFailure, isSwapExecutionError, isTransactionExecutionFailure, isTransactionParseFailure, isTransactionPreparationFailure } from "./rpc_types";

export async function parseSwapTransactionUsingJupiterAPI(positionID : string, transactionResult : PreparseSwapResult, env : Env) : Promise<SwapResult> {
    
    const status = transactionResult.status;

    if (isTransactionPreparationFailure(status)) {
        return { positionID : positionID, status: status };
    }
    else if (isTransactionExecutionFailure(status)) {
        return { positionID : positionID, status: status };
    }

    const signature = transactionResult.signature!!;
    const parsedTransaction = await callJupiterParseAPI(signature, env);

    if (isTransactionParseFailure(parsedTransaction)) {
        return { positionID : positionID, status: parsedTransaction, signature : signature };
    }

    const summary = summarizeParsedSwapTransaction(parsedTransaction, env);

    if (isSwapExecutionError(summary)) {
        return { positionID : positionID, status: summary, signature : signature };
    }

    return { positionID : positionID, status: 'swap-successful', signature : signature, successfulSwapSummary: summary };
}

async function callJupiterParseAPI(signature : string, env : Env) : Promise<TransactionParseFailure|{ parsed: any }> {
    
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

    const datas = (await response.json().catch(reason => null)) as any[]|null;

    return { 'parsed': (datas||[{}])[0] };
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

function calculateFillPrice(tokenInput : HeliusParsedTokenInputOutput, tokenOutput : HeliusParsedTokenInputOutput) {
    return dDiv(tokenOutput.rawTokenAmount, tokenInput.rawTokenAmount, MATH_DECIMAL_PLACES)
}