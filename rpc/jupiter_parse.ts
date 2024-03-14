import { MATH_DECIMAL_PLACES } from "../decimalized/decimalized_amount";
import { dDiv } from "../decimalized/decimalized_math";
import { Env } from "../env";
import { getVsTokenDecimalsMultiplier } from "../tokens/vs_tokens";
import { makeJSONRequest } from "../util/http_helpers";
import { HeliusParsedTokenInputOutput, SwapSummary, SwapExecutionError } from "./rpc_types";



function summarizeParsedSwapTransaction(summarizeMe : { parsed: any }, env : Env) : SwapExecutionError|SwapSummary {

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