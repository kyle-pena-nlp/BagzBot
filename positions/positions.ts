import { TokenInfo } from "../tokens/token_info"

export enum PositionType {
	LongTrailingStopLoss = "Auto-Sell"
};

export enum PositionStatus {
	Unfilled,
	Open,
	Closing,
	Closed
};


export interface Position {
	[key : string]: any
	userID : number
	positionID : string
	type: PositionType
	status : PositionStatus
	token: TokenInfo
	vsToken: TokenInfo
	vsTokenAmt: number // TODO: switch to RawTokenAmount (decimalized)
	vsTokenValue : number
	tokenAmt : number
	highestFillPrice : number
	sellSlippagePercent : number
}

export interface LongTrailingStopLossPosition extends Position {
	triggerPercent : number
	retrySellIfSlippageExceeded : boolean
}

export interface PositionRequest {
	userID : number
	chatID : number
	positionID : string
	type : PositionType
	token : TokenInfo
	vsToken : TokenInfo
	vsTokenAmt : number
	slippagePercent : number
}

export interface LongTrailingStopLossPositionRequest extends PositionRequest {
	[ key : string ] : any
	triggerPercent : number
	retrySellIfSlippageExceeded : boolean
}