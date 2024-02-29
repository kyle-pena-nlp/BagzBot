export enum ERRORS {
 	UNHANDLED_EXCEPTION = 500,
	MISMATCHED_SECRET_TOKEN = 1000,
	COULDNT_PARSE_REQUEST_BODY_JSON = 1500,
	NO_RESPONSE = 2000,
	NOT_A_PRIVATE_CHAT = 3000
}

export interface Env {
	ENVIRONMENT : string
	TELEGRAM_BOT_SERVER_URL : string
	TELEGRAM_BOT_TOKEN : string
	TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN : string
	TELEGRAM_API_ID : string
	TELEGRAM_API_HASH : string
	RPC_ENDPOINT_URL : string
	JUPITER_PRICE_API_URL : string
	UserDO : any // i'd like to strongly type this as DurableObjectNamespace, but can't for technical reasons
	TokenPairPositionTrackerDO : any // ditto
	PolledTokenPairListDO : any // ditto
};

export enum PositionType {
	LongTrailingStopLoss = "Auto-Sell"
};

export enum PositionStatus {
	Unfilled,
	Open,
	Closing,
	Closed
};

export interface ClosePositionRequest {
    positionID : string
};



export interface Position {
	userID : number
	positionID : string
	type: PositionType
	status : PositionStatus
	token : string
	tokenAddress: string
	vsToken : string
	vsTokenAddress: string
	vsTokenValue : number
	tokenAmt : number
	highestFillPrice : number
}

export interface LongTrailingStopLossPosition extends Position {
	triggerPercent : number
	retrySellIfPartialFill : boolean
}

export interface PositionRequest {
	positionID : string
	type : PositionType
	tokenAddress : string
	vsTokenAddress : string
	vsTokenAmt : number
	slippagePercent : number
}

export interface LongTrailingStopLossPositionRequest extends PositionRequest {
	[ key : string ] : any
	triggerPercent : number
	retrySellIfPartialFill : boolean
}

export interface LongTrailingStopLossPositionRequestResponse {
	
}

export interface DefaultTrailingStopLossRequestRequest {
	token : string
	tokenAddress : string
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

export interface Wallet {
	publicKey : string
	privateKey : string
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
	token : string
	vsToken : string
	tokenAddress : string
	vsTokenAddress : string
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
	retrySellPositionID : string|null
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

/*{
	PositionID = "positionID",
	Token = "token",
	TokenAddress = "tokenAddress",
	VsToken = "vsToken",
	VsTokenAddress = "vsTokenAddress",
	VsTokenAmt = "vsTokenAmt",
	PositionType = "positionType",
	TrailingStopLossSlippagePct = "trailingStopLossSlippagePct",
	TrailingStopLossTriggerPercent = "trailingStopLossTriggerPercent",	
	TrailingStopLossRetrySellIfPartialFill = "trailingStopLossRetrySellIfPartialFill",
	TrailingStopLossRetrySellIfSlippagePctExceeded = "trailingStopLossRetrySellIfSlippagePctExceeded"
}*/

export type SessionValue = boolean|string|number|null;