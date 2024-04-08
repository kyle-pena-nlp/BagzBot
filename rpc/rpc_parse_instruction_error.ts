import { Env } from "../env";
import { strictParseInt } from "../util";
import { SwapExecutionError } from "./rpc_types";

type InstructionError = [number,{ Custom : number}]

function isInstructionError(err : any) : err is InstructionError {
    return Array.isArray(err) && err.length >= 2 && 'Custom' in err[1];
}

export function parseInstructionError(err : any, env : Env) {
    const instructionError = err?.InstructionError;
    if (!isInstructionError(instructionError)) {
        return SwapExecutionError.OtherSwapExecutionError;
    }
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
    else {
        return SwapExecutionError.OtherSwapExecutionError;
    }
}