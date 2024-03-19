import { DecimalizedAmount } from "../decimalized";
import { TokenInfo, getVsTokenInfo } from "../tokens";
import { Structural, isEnumValue } from "../util";

export enum PositionType {
	LongTrailingStopLoss = "Auto-Sell"
};

export function isPositionType(x : any) {
	return isEnumValue(x, PositionType);
}

export enum PositionStatus {
	Open = "Open",
	Closing = "Closing",
	Closed = "Closed"
};

export interface Position {
	readonly [ key : string ] : Structural
	userID : number
	chatID : number
	messageID : number
	positionID : string
	type: PositionType
	status : PositionStatus
	token: TokenInfo
	vsToken: TokenInfo
	vsTokenAmt: DecimalizedAmount
	tokenAmt : DecimalizedAmount
	fillPrice : DecimalizedAmount
	sellSlippagePercent : number

    /* Relevant if TLS position */
    triggerPercent : number
	retrySellIfSlippageExceeded : boolean
};

interface BasePositionRequest {

	userID : number
	chatID : number
	messageID : number

	positionID : string
	positionType : PositionType

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
	return  !('fillPrice' in s);
}

export function isPosition(s : Swappable) : s is Position {
	return ('fillPrice' in s);
}

export function isSwappable(x : any) : x is Swappable {
	return ('positionID' in x) && ('positionType' in x) && isPositionType(x['positionType']);
}

export function convertPreRequestToRequest(r : PositionPreRequest, token : TokenInfo) {
	const positionRequest : PositionRequest = {
		userID : r.userID,
		chatID : r.chatID,
		messageID : r.messageID,
		positionID : r.positionID,
		positionType: r.positionType,
		vsTokenAmt: r.vsTokenAmt,
		slippagePercent: r.slippagePercent,
		triggerPercent: r.triggerPercent,
		retrySellIfSlippageExceeded: r.retrySellIfSlippageExceeded,
		token: token,
		vsToken: getVsTokenInfo(r.vsTokenAddress)
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
        };
    }
    else {
        throw new Error("Programmer error.");
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
        throw new Error("Programmer error.");
    }
}

export class SwappableError {
	userID : number;
	chatID : number;
	messageID : number;
	message : string;
	inToken : TokenInfo;
	outToken : TokenInfo;
	constructor(s : Swappable, message : string) {
		this.userID = s.userID;
		this.chatID = s.chatID;
		this.messageID = s.messageID;
		this.message = message;
		const { inToken, outToken } = getInAndOutTokens(s);
		this.inToken = inToken;
		this.outToken = outToken;
	}
}