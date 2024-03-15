import { TokenInfo } from "../tokens/token_info"
import { DecimalizedAmount } from "../decimalized/decimalized_amount";
import { getVsTokenInfo } from "../tokens/vs_tokens";
import { Structural } from "../util/structural";

export enum PositionType {
	LongTrailingStopLoss = "Auto-Sell"
};

export enum PositionStatus {
	Open = "Open",
	Closing = "Closing",
	Closed = "Closed"
};


export interface Position {
	readonly [ key : string ] : Structural
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
	readonly [ key : string ] : Structural
	token : TokenInfo
	vsToken : TokenInfo
};

export type Swappable = PositionRequest | Position;

export function isPositionRequest(s : Swappable) : s is PositionRequest {
	return !('fillPrice' in s);
}

export function isPosition(s : Swappable) : s is Position {
	return 'fillPrice' in s;
}

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

export function getInAndOutTokens(s : Swappable): { inToken : TokenInfo, outToken : TokenInfo } {
    if (isPositionRequest(s)) {
        return { 
            inToken : s.vsToken,
            outToken : s.token
        };
    }
    else if (isPosition(s)) {
        return {
            inToken : s.token,
            outToken : s.vsToken
        }
    }
    else {
        throw new Error("Programmer error.")
    }
}

export function getSwapOfXDescription(s : Swappable, caps : boolean = false) : string {
    if (isPositionRequest(s)) {
        return (caps ? 'P' : 'p') + `urchase of ${s.token.symbol}`;
    }
    else if (isPosition(s)) {
        return (caps ? 'S' : 's') + `ale of ${s.token.symbol}`;
    }
    else {
        throw new Error("Programmer error.")
    }
}