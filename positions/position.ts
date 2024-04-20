import { UserAddress } from "../crypto";
import { DecimalizedAmount } from "../decimalized";
import { EnvironmentVariables, parsePriorityFeeOptions } from "../env";
import { TokenInfo } from "../tokens";
import { Structural, assertNever, isEnumValue } from "../util";
import { Quote } from "./quote";

export enum PositionType {
	LongTrailingStopLoss = "Auto-Sell"
};

export function isPositionType(x : any) : x is PositionType {
	return isEnumValue(x, PositionType);
}

// This flag (along with sellConfirmed and buyConfirmed drive the 'Position State Machine')
export enum PositionStatus {
	// Ready to Sell if buyConfirmed is true
	Open = "Open",
	// A sale may have been attempted - will be taken out of Closing upon sale completion, sale fail, or sell-confirm completion
	Closing = "Closing",
	// Position has been closed
	Closed = "Closed"
};

export interface Position {
	readonly [ key : string ] : Structural

	// metadata
	userID : number
	chatID : number
	messageID : number
	positionID : string
	userAddress : UserAddress	

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
	// When in Closing, sellConfirmed can be true or false
	// When in Open, buyConfirmed can be true or false
	status : PositionStatus

	txBuyAttemptTimeMS : number
	txBuySignature : string
	buyLastValidBlockheight : number
	buyConfirmed : boolean

	// TODO: set this & lastvalidBH on buy
	txSellAttemptTimeMS : number|null
	txSellSignature : string|null
	sellLastValidBlockheight : number|null
	sellConfirmed : boolean
	netPNL : DecimalizedAmount|null
	otherSellFailureCount : number|null // null for backwards compat

	buyPriorityFeeAutoMultiplier : 'auto'|number|null
	sellPriorityFeeAutoMultiplier : 'auto'|number|null
};

export interface BasePositionRequest {

	userID : number
	chatID : number
	messageID : number

	positionID : string
	positionType : PositionType

	vsToken : TokenInfo
	vsTokenAmt : number
	slippagePercent : number

    /* Relevant if TLS position */
	triggerPercent : number
	sellAutoDoubleSlippage : boolean|null

	priorityFeeAutoMultiplier : 'auto'|number|null
}

// Pre-request before full info is retrieved (like TokenInfo and BuyQuote)
export interface PositionPreRequest extends BasePositionRequest {
	readonly [ keyof : string ] : Structural
	tokenAddress : string
}

/*
	Complete position request - 
	just like a prerequest except with a quote and a full TokenInfo object 
	instead of just a address 
*/
export interface PositionRequest extends BasePositionRequest {
	readonly [ key : string ] : Structural
	token : TokenInfo
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
		vsToken: r.vsToken,
		priorityFeeAutoMultiplier: r.priorityFeeAutoMultiplier
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
        assertNever(s);
    }
}

export function describePriorityFee(priorityFee : null|"auto"|number, env : EnvironmentVariables) {
	if (priorityFee == null) {
		return "Priority Fees: Default";
	}
	else if (priorityFee == "auto") {
		return "Priority Fees: Default";
	}
	else if (typeof priorityFee === 'number') {
		const multiplierName = parsePriorityFeeOptions(env).get(priorityFee) || `${priorityFee.toString(10)}x`;
		return `Priority Fees: ${multiplierName}`;
	}
	else {
		assertNever(priorityFee);
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
        assertNever(s);
    }
}