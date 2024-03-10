import { TokenInfo } from "../tokens/token_info"
import { DecimalizedAmount } from "../decimalized/decimalized_amount";

export enum PositionType {
	LongTrailingStopLoss = "Auto-Sell"
};

export enum PositionStatus {
	Unfilled = "Unfilled",
	Open = "Open",
	Closing = "Closing",
	Closed = "Closed"
};


export interface Position {
	[key : string]: any

	userID : number
	positionID : string
	type: PositionType
	status : PositionStatus
	token: TokenInfo
	vsToken: TokenInfo
	vsTokenAmt: DecimalizedAmount // TODO: switch to RawTokenAmount (decimalized)
	tokenAmt : DecimalizedAmount
	fillPrice : DecimalizedAmount
	sellSlippagePercent : number

    /* Relevant if TLS position */
    triggerPercent : number
	retrySellIfSlippageExceeded : boolean
};

export interface PositionRequest {
    [ key : string ] : any

	userID : number
	positionID : string
	type : PositionType
	tokenAddress : string
	vsTokenAddress : string
	vsTokenAmt : number
	slippagePercent : number

    /* Relevant if TLS position */
	triggerPercent : number
	retrySellIfSlippageExceeded : boolean
};