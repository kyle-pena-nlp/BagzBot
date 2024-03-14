import { GetQuoteFailure } from "../rpc/rpc_interop";
import { PositionRequest } from "./positions";
import { Quote } from "./quote"

export interface PositionRequestAndQuote {
    positionRequest : PositionRequest
    quote : Quote|GetQuoteFailure
}