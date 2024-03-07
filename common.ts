import { LongTrailingStopLossPositionRequest, Position } from "./positions/positions"
import { TokenInfo } from "./tokens/token_info"

export enum ERRORS {
 	UNHANDLED_EXCEPTION = 500,
	MISMATCHED_SECRET_TOKEN = 1000,
	COULDNT_PARSE_REQUEST_BODY_JSON = 1500,
	NO_RESPONSE = 2000,
	NOT_A_PRIVATE_CHAT = 3000
}


export interface ClosePositionRequest {
    positionID : string
};

export interface ListPositionsRequest {
}


export interface LongTrailingStopLossPositionRequestResponse {
	
}

export interface DefaultTrailingStopLossRequestRequest {
	userID : number,
	chatID: number,
	token : TokenInfo
}

export interface CreateWalletRequest {

}

export interface CreateWalletResponse {

}

export interface PriceUpdate {
    token : string
    vsToken : string
    price : number
}

export interface QuantityAndToken {
	thisToken : string
	thisTokenAddress : string
	quantity : number
}


export class Result<T> {

	success: boolean
	ok: boolean
	message?: string
	value?: T

	constructor(success : boolean, message? : string, value? : T) {
		this.success = success;
		this.ok = success;
		this.message = message;
		this.value = value;
	}	

	static success<T>(value : T) {
		return new Result<T>(true,undefined,value);
	}

	static failure<T>(message : string | ERRORS | undefined) {
		return new Result<T>(false,(message||'').toString(),undefined);
	}
}

export interface UserData {
	durableObjectID : string
	initialized : boolean	
	telegramUserID? : number
	telegramUserName?: string
	hasWallet: boolean
	session : Record<string,SessionValue>
	positions : PositionDisplayInfo[]
};

export interface PositionDisplayInfo {
	positionID : string
	token : string
	amount : number
	positionTypeName : string
};

export interface GetUserDataRequest {
	messageID : number
};

export interface GetPositionRequest {
	positionID : string
};

export interface StoreSessionValuesRequest {
	messageID: number
	sessionValues : Record<string,SessionValue>
};

export interface StoreSessionValuesResponse {
};

export interface GetSessionValuesRequest {
	messageID : number
	sessionKeys : string[]
}

export interface SessionValuesResponse {
	sessionValues : Record<string,SessionValue>
}

export interface DeleteSessionRequest {
	messageID : number
};

export interface UserInitializeRequest {
	telegramUserID : number
	telegramUserName : string
};

export interface UserInitializeResponse {
};

export interface TokenPairPositionTrackerInitializeRequest {
	token : TokenInfo
	vsToken : TokenInfo
};

export interface OpenPositionRequest {
	durableObjectID : string // UserDO
	positionRequests : LongTrailingStopLossPositionRequest[]
};

export interface ClosePositionsRequest {
	positionIDs : string[]
};

export interface ClosePositionsResponse {
}

export interface ManuallyClosePositionRequest {
	positionID : string
}

export interface ManuallyClosePositionResponse {

}

export interface NotifyPositionAutoClosedInfo {
	positionID : string
	tokenAddress: string
	vsTokenAddress:string
	amountTokenSold: number
	amountTokenUnsold: number
	willRetry : boolean
};

export interface NotifyPositionsAutoClosedRequest {
	notifyPositionAutoClosedInfos : NotifyPositionAutoClosedInfo[]
};

export interface NotifyPositionAutoClosedRequest {
	notifyPositionAutoClosedInfo : NotifyPositionAutoClosedInfo
}

export interface GetPositionsFromTokenPairTrackerRequest {
	positionIDs : string[]
};

export interface GetPositionsFromTokenPairTrackerResponse {
	positions : Position[]
};

export interface WalletData {
	purchasingPowerUSDC : number
	purchasingPowerSOL : number	
	usdcValue : number
	solValue : number
};

export interface TokenNameAndAddress {
	token : string
	tokenAddress : string
};

export interface GetSessionValuesWithPrefixRequest {
	messageID : number
	prefix : string
};

export interface GetSessionValuesWithPrefixResponse {
	values : Record<string,SessionValue>
};

export type SessionKey = string; 

export type SessionValue = boolean|string|number|null;

export enum CouldNotOpenPositionReason {
	IsAlreadyBeingFilled = "IsAlreadyBeingFilled",
	SlippageToleranceExceeded = "SlippageToleranceExceeded",
	InsufficientFunds = "InsufficientFunds"
}

export enum CouldNotClosePositionReason {
	IsCurrentBeingFilled = "IsCurrentBeingFilled",
	IsAlreadyBeingClosed = "IsAlreadyBeingClosed",
	IsAlreadyClosed = "IsAlreadyClosed",
	DoesNotExist = "DoesNotExist"
}