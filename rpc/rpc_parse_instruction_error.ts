import { Env } from "../env";
import { strictParseInt } from "../util";
import { SwapExecutionError } from "./rpc_types";

type InstructionError = [number,{ Custom : number}]

function isInstructionError(err : any) : err is InstructionError {
    return Array.isArray(err) && err.length >= 2 && 'Custom' in err[1];
}

function parseSwapExecutionError(err : InstructionError, env : Env) {
    if (!isInstructionError(err)) {
        return SwapExecutionError.OtherSwapExecutionError;
    }
    const [index, { Custom }] = err;
    if (Custom === strictParseInt(env.JUPITER_SWAP_PROGRAM_FEE_ACCOUNT_NOT_INITIALIZED_ERROR_CODE)) {
        return SwapExecutionError.TokenAccountFeeNotInitialized;
        
    }
}