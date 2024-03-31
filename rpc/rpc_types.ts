import { DecimalizedAmount } from "../decimalized";
import { isEnumValue } from "../util";

export enum GetQuoteFailure {
    FailedToDetermineSwapRoute = "FailedToDetermineSwapRoute"
}

// couldn't even send the transaction
export enum TransactionPreparationFailure {
    FailedToSerializeTransaction = "FailedToSerializeTransaction",
    FailedToSignTransaction = "FailedToSignTransaction"
};


export enum TransactionExecutionError {
    CouldNotPollBlockheightNoTxSent = "CouldNotPollBlockheightNoTxSent",
    CouldNotDetermineMaxBlockheight = "CouldNotDetermineMaxBlockheight",
    BlockheightExceeded = "BlockheightExceeded",
    TransactionDropped = "TransactionDropped",
    TransactionFailedOtherReason = "TransactionFailedOtherReason",
    SlippageToleranceExceeded = "SlippageToleranceExceeded",
    InsufficientNativeTokensError = "InsufficientNativeTokensError",
    InsufficientFundsError = "InsufficientFundsError",
    TokenFeeAccountNotInitialized = "TokenFeeAccountNotInitialized"
};

export enum TransactionExecutionErrorCouldntConfirm {
    CouldNotConfirmTooManyExceptions = "CouldNotConfirmTooManyExceptions",
    TimeoutCouldNotConfirm = "TimeoutCouldNotConfirm",
    UnknownCouldNotConfirm = "UnknownCouldNotConfirm"
}


export type PreparseSwapResult = PreparseUnconfirmedSwapResult | PreparseConfirmedSwapResult | PreparseSwapExecutionError | PreparseFailedSwapResult;

interface BasePreparseResult {
    positionID : string
    signature : string
}

export interface PreparseConfirmedSwapResult extends BasePreparseResult {
    status: 'transaction-confirmed'
};

export interface PreparseFailedSwapResult extends BasePreparseResult {
    status: TransactionExecutionError
};

export interface PreparseUnconfirmedSwapResult extends BasePreparseResult {
    status: TransactionExecutionErrorCouldntConfirm
};

export interface PreparseSwapExecutionError extends BasePreparseResult {
    status: SwapExecutionError
}

export interface PreparseSwapExcecutionSlippageError extends BasePreparseResult {
    status: SwapExecutionError.SlippageToleranceExceeded
}

export enum SwapExecutionError {
    InsufficientSOLBalance = "InsufficientSOLBalance",
    InsufficientTokenBalance = "InsufficientTokenBalance",
    SlippageToleranceExceeded = "SlippageToleranceExceeded",
    OtherSwapExecutionError = "OtherSwapExecutionError",
    TokenAccountFeeNotInitialized = "TokenAccountFeeNotInitialized"
};



export interface UnknownTransactionParseSummary {
    status: 'unknown-transaction';
}

export interface SwapExecutionErrorParseSummary {
    status : SwapExecutionError
}

export interface SlippageSwapExecutionErrorParseSummary {
    status: SwapExecutionError.SlippageToleranceExceeded
}

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
    txSignature : string
    txSlot: number
};

export type ParsedSwapSummary = ParsedSuccessfulSwapSummary | 
    UnknownTransactionParseSummary | 
    SwapExecutionErrorParseSummary;

export interface ConfirmationErr {
    err: {}|string
};

export interface HeliusParsedTokenInputOutput {
    rawTokenAmount : DecimalizedAmount
    mint : string
}

export interface HeliusParsedTokenTransfer {
    tokenAmount : number,
    mint : string
}

export function isTransactionPreparationFailure<T>(obj : T|TransactionPreparationFailure) : obj is TransactionPreparationFailure {
    return isEnumValue(obj, TransactionPreparationFailure);
    //return typeof obj === 'string' && obj != null && Object.values(obj).includes(TransactionPreparationFailure.FailedToDetermineSwapRoute);
}

export function isGetQuoteFailure<T>(obj : T|GetQuoteFailure) : obj is GetQuoteFailure {
    return isEnumValue(obj, GetQuoteFailure);
}

export function isTransactionExecutionError<T>(obj : T|TransactionExecutionError) : obj is TransactionExecutionError {
    return isEnumValue(obj, TransactionExecutionError);
    //return typeof obj === 'string' && obj != null && (Object.values(TransactionExecutionError) as any[]).includes(obj);
}

export function isTransactionExecutionErrorCouldntConfirm<T>(obj : T|TransactionExecutionErrorCouldntConfirm) : obj is TransactionExecutionErrorCouldntConfirm {
    return isEnumValue(obj, TransactionExecutionErrorCouldntConfirm);
}

export function isUnknownTransactionParseSummary(obj : ParsedSwapSummary) : obj is UnknownTransactionParseSummary {
    return obj.status === 'unknown-transaction';
}

export function isSwapExecutionErrorParseSummary(obj : ParsedSwapSummary) : obj is SwapExecutionErrorParseSummary {
    return isEnumValue(obj.status, SwapExecutionError);
}

export function isSlippageSwapExecutionErrorParseSummary(obj : ParsedSwapSummary) : obj is SlippageSwapExecutionErrorParseSummary {
    return isSwapExecutionErrorParseSummary(obj) && obj.status === SwapExecutionError.SlippageToleranceExceeded;
}

export function isSuccessfullyParsedSwapSummary(obj : ParsedSwapSummary|string) : obj is ParsedSuccessfulSwapSummary {
    return typeof obj === 'object' && obj.status === 'swap-successful';
}

export function isSwapExecutionError<T>(obj: T | SwapExecutionError): obj is SwapExecutionError {
    return isEnumValue(obj, SwapExecutionError);
    //return typeof obj === 'string' && obj != null && Object.values(obj).includes(SwapExecutionError.OtherError);
}

export function isTransactionParseErrorHeliusResponse(obj: { error: string }|any[]) : obj is { error : string } {
    return obj && typeof obj === 'object' && "error" in obj;
}

export function isSwapExecutionErrorParseSwapSummary(parsedSwapResult : ParsedSwapSummary) : parsedSwapResult is SwapExecutionErrorParseSummary {
    return isSwapExecutionError(parsedSwapResult.status);
}

export function isSuccessfulSwapSummary(parsedSwapResult : ParsedSwapSummary): parsedSwapResult is ParsedSuccessfulSwapSummary {
    return parsedSwapResult.status === 'swap-successful';
}


export function isConfirmed(maybeExecutedTx : PreparseSwapResult) : maybeExecutedTx is PreparseConfirmedSwapResult {
    return maybeExecutedTx.status === 'transaction-confirmed';
}

export function isFailedSwapTxExecution(maybeExecutedTx : PreparseSwapResult) : maybeExecutedTx is PreparseSwapExecutionError {
    return isEnumValue(maybeExecutedTx.status, SwapExecutionError);
}

export function isFailedSwapSlippageTxExecution(maybeExecutedTx : PreparseSwapResult) : maybeExecutedTx is PreparseSwapExcecutionSlippageError {
    return maybeExecutedTx.status === SwapExecutionError.SlippageToleranceExceeded;
}

export function isFailedTxExecution(maybeExecutedTx : PreparseSwapResult) : maybeExecutedTx is PreparseFailedSwapResult {
    return isTransactionExecutionError(maybeExecutedTx.status);
}

export function isUnconfirmedTxExecution(maybeExecutedTx : PreparseSwapResult) : maybeExecutedTx is PreparseUnconfirmedSwapResult {
    return isTransactionExecutionErrorCouldntConfirm(maybeExecutedTx.status);
}