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
