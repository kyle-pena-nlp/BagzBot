import { DecimalizedAmount } from "../decimalized";
import { TokenInfo } from "../tokens";
import { Structural, isEnumValue } from "../util";
import { Quote } from "./quote";

export enum PositionType {
	LongTrailingStopLoss = "Auto-Sell"
};

export function isPositionType(x : any) : x is PositionType {
	return isEnumValue(x, PositionType);
}

export enum PositionStatus {
	Open = "Open",
	Closing = "Closing",
	Closed = "Closed"
};

export interface Position {
	readonly [ key : string ] : Structural

	// metadata
	userID : number
	chatID : number
	messageID : number
	positionID : string

	// position data
	type: PositionType	
	token: TokenInfo
	vsToken: TokenInfo
	vsTokenAmt: DecimalizedAmount
	tokenAmt : DecimalizedAmount
	fillPrice : DecimalizedAmount
	fillPriceMS : number


	// user sell settings
    triggerPercent : number
	sellAutoDoubleSlippage : boolean|null
	sellSlippagePercent : number // also used for buy

	// Position State Management

	// Open, Closing, Closed.
	// When in Closing, prevents sell or auto-sell
	status : PositionStatus

	// TODO: set this & lastvalidBH on buy
	txBuySignature : string
	buyLastValidBlockheight : number
	buyConfirmed : boolean
	isConfirmingBuy : boolean

	// TODO: set this & lastvalidBH on buy
	txSellSignature : string|null
	sellLastValidBlockheight : number|null
	sellConfirmed : boolean|null
	isConfirmingSell : boolean	
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
	sellAutoDoubleSlippage : boolean|null
}

// Pre-request before full info is retrieved (like TokenInfo and BuyQuote)
export interface PositionPreRequest extends BasePositionRequest {
	readonly [ keyof : string ] : Structural
	tokenAddress : string
	vsToken : TokenInfo
}

// Complete position request
export interface PositionRequest extends BasePositionRequest {
	readonly [ key : string ] : Structural
	token : TokenInfo
	vsToken : TokenInfo
	quote : Quote
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

export function convertPreRequestToRequest(r : PositionPreRequest, quote : Quote, token : TokenInfo) {
	const positionRequest : PositionRequest = {
		userID : r.userID,
		chatID : r.chatID,
		messageID : r.messageID,
		positionID : r.positionID,
		positionType: r.positionType,
		vsTokenAmt: r.vsTokenAmt,
		quote : quote,
		slippagePercent: r.slippagePercent,
		triggerPercent: r.triggerPercent,
		sellAutoDoubleSlippage: r.sellAutoDoubleSlippage,
		token: token,
		vsToken: r.vsToken
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