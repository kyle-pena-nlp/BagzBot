import { GetQuoteFailure } from "../rpc/rpc_types";
import { isEnumValue } from "../util";
import { PositionRequest } from "./position";
import { Quote } from "./quote";

export type PositionRequestAndMaybeQuote = PositionRequestAndQuote | PositionRequestAndQuoteFailure

export interface PositionRequestAndQuote {
    positionRequest : PositionRequest
    quote : Quote
}

export interface PositionRequestAndQuoteFailure {
    positionRequest : PositionRequest
    quote : GetQuoteFailure
}

export function isPositionRequestAndQuote(x : PositionRequestAndMaybeQuote) : x is PositionRequestAndQuote {
    return !isEnumValue(x.quote, GetQuoteFailure);
}

export function isPositionRequestAndQuoteFailure(x : PositionRequestAndMaybeQuote) : x is PositionRequestAndQuoteFailure {
    return isEnumValue(x.quote, GetQuoteFailure);
}