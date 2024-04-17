import { DecimalizedAmount } from "../decimalized";
import { isEnumValue } from "../util";


export type ParsedSwapSummary = ParsedSuccessfulSwapSummary | 
    UnknownTransactionParseSummary | 
    SlippageSwapExecutionErrorParseSummary |
    InsufficientNativeTokensExecutionErrorParseSummary |
    TokenFeeAccountNotInitializedExecutionErrorParseSummary |
    OtherSwapExecutionErrorParseSummary |
    FrozenTokenAccountExecutionErrorParseSummary |
    InsuffucientTokensBalanceParseSummary;

export interface ParsedSuccessfulSwapSummary {
    status : 'swap-successful'
    swapSummary : SwapSummary
}

export interface SwapSummary {
    inTokenAddress : string,
    inTokenAmt : DecimalizedAmount,
    outTokenAddress: string,
    outTokenAmt: DecimalizedAmount,
    fees: number
    fillPrice : DecimalizedAmount
    swapTimeMS : number
    txSignature : string
    txSlot: number
};

export enum SwapExecutionError {
    InsufficientSOLBalance = "InsufficientSOLBalance",
    SlippageToleranceExceeded = "SlippageToleranceExceeded",
    OtherSwapExecutionError = "OtherSwapExecutionError",
    TokenAccountFeeNotInitialized = "TokenAccountFeeNotInitialized",
    FrozenTokenAccount = "FrozenTokenAccount",
    InsufficientTokensBalance = "InsufficientTokensBalance"
};



export interface UnknownTransactionParseSummary {
    status: 'unknown-transaction';
}

// not enough of the token to complete the swap
export interface InsuffucientTokensBalanceParseSummary {
    status: SwapExecutionError.InsufficientTokensBalance
}

// slippage
export interface SlippageSwapExecutionErrorParseSummary {
    status: SwapExecutionError.SlippageToleranceExceeded
}

// token account frozen (a rugged token)
export interface FrozenTokenAccountExecutionErrorParseSummary {
    status: SwapExecutionError.FrozenTokenAccount
}

// not enough SOL in wallet to complete tx
export interface InsufficientNativeTokensExecutionErrorParseSummary {
    status: SwapExecutionError.InsufficientSOLBalance
}

// i didn't configure the fee account. devops error.
// TODO: email alerts for this and other special errors
export interface TokenFeeAccountNotInitializedExecutionErrorParseSummary {
    status: SwapExecutionError.TokenAccountFeeNotInitialized
}

// anything else
export interface OtherSwapExecutionErrorParseSummary {
    status: SwapExecutionError.OtherSwapExecutionError
}

export function isSuccessfulSwapSummary(parsedSwapResult : ParsedSwapSummary): parsedSwapResult is ParsedSuccessfulSwapSummary {
    return parsedSwapResult.status === 'swap-successful';
}

export function isUnknownTransactionParseSummary(obj : ParsedSwapSummary) : obj is UnknownTransactionParseSummary {
    return obj.status === 'unknown-transaction';
}

export function isInsufficientTokensBalanceErrorParseSummary(obj : ParsedSwapSummary) : obj is InsuffucientTokensBalanceParseSummary {
    return obj.status === SwapExecutionError.InsufficientTokensBalance;
}

export function isSlippageSwapExecutionErrorParseSummary(obj : ParsedSwapSummary) : obj is SlippageSwapExecutionErrorParseSummary {
    return obj.status === SwapExecutionError.SlippageToleranceExceeded;
}

export function isFrozenTokenAccountSwapExecutionErrorParseSummary(obj : ParsedSwapSummary) : obj is FrozenTokenAccountExecutionErrorParseSummary {
    return obj.status === SwapExecutionError.FrozenTokenAccount;
}

export function isTokenFeeAccountNotInitializedSwapExecutionErrorParseSummary(obj : ParsedSwapSummary) : obj is TokenFeeAccountNotInitializedExecutionErrorParseSummary {
    return obj.status === SwapExecutionError.TokenAccountFeeNotInitialized;
}

export function isInsufficientNativeTokensSwapExecutionErrorParseSummary(obj : ParsedSwapSummary) : obj is InsufficientNativeTokensExecutionErrorParseSummary {
    return obj.status === SwapExecutionError.InsufficientSOLBalance;
}

// TODO: insufficient tokens balance for sell

export function isOtherKindOfSwapExecutionError(obj : ParsedSwapSummary): obj is OtherSwapExecutionErrorParseSummary {
    return obj.status === SwapExecutionError.OtherSwapExecutionError;
}

export function isSuccessfullyParsedSwapSummary(obj : ParsedSwapSummary|string) : obj is ParsedSuccessfulSwapSummary {
    return typeof obj === 'object' && obj.status === 'swap-successful';
}

export function isSwapExecutionError<T>(obj: T | SwapExecutionError): obj is SwapExecutionError {
    return isEnumValue(obj, SwapExecutionError);
    //return typeof obj === 'string' && obj != null && Object.values(obj).includes(SwapExecutionError.OtherError);
}
