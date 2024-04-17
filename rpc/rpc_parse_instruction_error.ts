import { Env } from "../env";
import { strictParseInt } from "../util";
import { SwapExecutionError } from "./rpc_swap_parse_result_types";

export function parseInstructionError(err : any, env : Env) {

    // wallet with 0.0 SOL is considered 'not found' even if it had SOL previously
    if (err === 'AccountNotFound') {
        return SwapExecutionError.InsufficientSOLBalance;
    }

    const instructionError = err?.InstructionError;
    if (!isInstructionError(instructionError)) {
        return SwapExecutionError.OtherSwapExecutionError;
    }

    // TODO: more foolproof way would involve also checking the index of the error.
    const  { InstructionError: [index, { Custom }] } = err;

    if (Custom === strictParseInt(env.JUPITER_SWAP_PROGRAM_FEE_ACCOUNT_NOT_INITIALIZED_ERROR_CODE)) {
        return SwapExecutionError.TokenAccountFeeNotInitialized;
    }
    else if (Custom === strictParseInt(env.JUPITER_SWAP_PROGRAM_INSUFFICIENT_LAMPORTS_ERROR_CODE)) {
        return SwapExecutionError.InsufficientSOLBalance;
    }
    else if (Custom === strictParseInt(env.JUPITER_SWAP_PROGRAM_SLIPPAGE_ERROR_CODE)) {
        return SwapExecutionError.SlippageToleranceExceeded;
    }
    else if (Custom === strictParseInt(env.JUPITER_SWAP_PROGRAM_TOKEN_ACCOUNT_FROZEN_ERROR_CODE)) {
        return SwapExecutionError.FrozenTokenAccount;
    }
    else {
        return SwapExecutionError.OtherSwapExecutionError;
    }
}

type InstructionError = [number,{ Custom : number}]

function isInstructionError(err : any) : err is InstructionError {
    return Array.isArray(err) && err.length >= 2 && 'Custom' in err[1];
}