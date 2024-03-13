import { DecimalizedAmount } from "../decimalized/decimalized_amount";

export enum GetQuoteFailure {
    FailedToDetermineSwapRoute = "FailedToDetermineSwapRoute"
}

// couldn't even send the transaction
export enum TransactionPreparationFailure {
    FailedToSerializeTransaction = "FailedToSerializeTransaction",
    FailedToSignTransaction = "FailedToSignTransaction"
};

export enum TransactionParseFailure {
    BadRequest = "BadRequest",
    RateLimited = "RateLimited",
    UnknownTransaction = "UnknownTransaction",
    InternalError = "InternalError",
    CouldNotDetermineAmountsSpent = "CouldNotDetermineAmountsSpent"
};

export enum TransactionExecutionError {
    CouldNotPollBlockheight = "CouldNotPollBlockheight",
    BlockheightExceeded = "BlockheightExceeded",
    TransactionDropped = "TransactionDropped",
    TransactionFailedOtherReason = "TransactionFailedOtherReason",
    CouldNotConfirmTooManyExceptions = "CouldNotConfirmTooManyExceptions",
    TimeoutCouldNotConfirm = "TimeoutCouldNotConfirm",
    Unknown = "Unknown",
    SlippageToleranceExceeded = "SlippageToleranceExceeded",
    InsufficientNativeTokensError = "InsufficientNativeTokensError",
    InsufficientFundsError = "InsufficientFundsError"
};

export enum SwapExecutionError {
    InsufficientBalance = "InsufficientBalance",
    SlippageToleranceExceeded = "SlippageToleranceExceeded",
    OtherSwapExecutionError = "OtherSwapExecutionError"
};

export interface PreparseSwapResult {
    positionID : string
    status: GetQuoteFailure|TransactionPreparationFailure|TransactionExecutionError|TransactionExecutionError|'transaction-confirmed'
    signature ?: string
}

export interface SwapResult {
    positionID : string
    status: GetQuoteFailure|TransactionPreparationFailure|TransactionExecutionError|TransactionParseFailure|SwapExecutionError|'swap-successful'
    signature ?: string
    successfulSwapSummary ?: SuccessfulSwapSummary
};

export interface SuccessfulSwapSummary {
    inTokenAddress : string,
    inTokenAmt : DecimalizedAmount,
    outTokenAddress: string,
    outTokenAmt: DecimalizedAmount,
    fees: number
    fillPrice : DecimalizedAmount
};



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

export function isTransactionExecutionFailure<T>(obj : T|TransactionExecutionError) : obj is TransactionExecutionError {
    return isEnumValue(obj, TransactionExecutionError);
    //return typeof obj === 'string' && obj != null && (Object.values(TransactionExecutionError) as any[]).includes(obj);
}

export function isRetryableTransactionParseFailure<T>(obj : T | TransactionParseFailure) : obj is TransactionParseFailure.RateLimited|TransactionParseFailure.InternalError {
    return obj === TransactionParseFailure.RateLimited || obj === TransactionParseFailure.InternalError;
}

export function isTransactionParseFailure<T>(obj : T |TransactionParseFailure) : obj is TransactionParseFailure {
    return isEnumValue(obj, TransactionParseFailure);
    //return typeof obj === 'string' && obj != null && Object.values(obj).includes(TransactionParseFailure.BadRequest);
}

export function isSwapExecutionError<T>(obj: T | SwapExecutionError): obj is SwapExecutionError {
    return isEnumValue(obj, SwapExecutionError);
    //return typeof obj === 'string' && obj != null && Object.values(obj).includes(SwapExecutionError.OtherError);
}


function isEnumValue<T extends Record<string,string|number>>(value: any, enumType: T): value is T[keyof T] {
    return Object.values(enumType).includes(value);
}

export function isTransactionParseErrorHeliusResponse(obj: { error: string }|any[]) : obj is { error : string } {
    return obj && typeof obj === 'object' && "error" in obj;
}
