import { Structural } from "../util"

export interface PartialTransferFundsRequest {
    readonly [ key : string ]: Structural
    recipientAddress : string
}

export interface CompleteTransferFundsRequest {
    readonly [ key : string ]: Structural
    recipientAddress : string
    solQuantity : number
}