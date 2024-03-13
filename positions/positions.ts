import { TokenInfo } from "../tokens/token_info"
import { DecimalizedAmount } from "../decimalized/decimalized_amount";
import { getVsTokenInfo } from "../tokens/vs_tokens";
import { SessionValue } from "../durable_objects/user/model/session";

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

	userID : number
	chatID : number
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

export interface BasePositionRequest {

	userID : number
	chatID : number
	positionID : string
	type : PositionType

	vsTokenAmt : number
	slippagePercent : number

    /* Relevant if TLS position */
	triggerPercent : number
	retrySellIfSlippageExceeded : boolean
}

export interface PositionPreRequest extends BasePositionRequest {
	tokenAddress : string
	vsTokenAddress : string
}

export interface PositionRequest extends BasePositionRequest {
	[ key : string ] : SessionValue
	token : TokenInfo
	vsToken : TokenInfo
};

export function convertPreRequestToRequest(r : PositionPreRequest, token : TokenInfo) {
	const positionRequest : PositionRequest = {
		userID : r.userID,
		chatID : r.chatID,
		positionID : r.positionID,
		type: r.type,
		vsTokenAmt: r.vsTokenAmt,
		slippagePercent: r.slippagePercent,
		triggerPercent: r.triggerPercent,
		retrySellIfSlippageExceeded: r.retrySellIfSlippageExceeded,
		token: token,
		vsToken: getVsTokenInfo(r.vsTokenAddress)!!
	};
	return positionRequest;
}