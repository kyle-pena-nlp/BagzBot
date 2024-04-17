import { Env } from "../env";
import { strictParseInt } from "../util";
import { SwapExecutionError } from "./rpc_swap_parse_result_types";

// Reference: https://github.com/solana-labs/solana-web3.js/blob/028bdcca60ca69897ea2131e4047c607ec354a3e/packages/rpc-types/src/transaction-error.ts

export function parseInstructionError(err : any, env : Env) {

    // wallet with 0.0 SOL is considered 'not found' even if it had SOL previously
    if (err === 'AccountNotFound') {
        return SwapExecutionError.InsufficientSOLBalance;
    }

    if (err === 'InsufficientFundsForFee') {
        return SwapExecutionError.InsufficientSOLBalance;
    }

    // TODO: should technically also check err.InsufficientFundsForRent.accountIndex
    if ('InsufficientFundsForRent' in err) {
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
    else if (index === 3 && Custom === strictParseInt(env.JUPITER_SWAP_PROGRAM_INSUFFICIENT_BALANCE_ERROR_CODE)) {
        return SwapExecutionError.InsufficientTokensBalance;
    }
    else if (Custom === strictParseInt(env.JUPITER_SWAP_PROGRAM_INSUFFICIENT_BALANCE_ERROR_CODE)) {
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