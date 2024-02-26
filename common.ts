import { makeJSONRequest, makeRequest } from "./http_helpers"

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

export enum VsToken {
	SOL = "SOL",
	USDC = "USDC"
};

export function getVsTokenAddress(vsToken : VsToken) {
	switch(vsToken) {
		case VsToken.SOL:
			return "..."; // TODO
		case VsToken.USDC:
			return "..."; // TODO
		default:
			throw new Error("Unknown VsToken: ${vsToken.toString()}")
	}
}

export enum PositionStatus {
	Unfilled,
	Open,
	Closing,
	Closed
};

export interface ClosePositionRequest {
    positionID : string
};

export interface PositionRequest {
	positionID : string
	type : PositionType
	token : string
	tokenAddress : string
	vsToken : string
	vsTokenAddress : string
	vsTokenAmt : number
	slippagePercent : number
}

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

export interface LongTrailingStopLossPositionRequest extends PositionRequest {
	triggerPercent : number
	retrySellIfPartialFill : boolean
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

export const COMMANDS = ["/start", "/help", "/menu"];

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
	session : Record<string,boolean|number|string|null>
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
	sessionValues : Record<string,boolean|number|string|null>
};

export interface GetSessionValuesRequest {
	messageID : number
	sessionKeys : string[]
}

export interface SessionValuesResponse {
	sessionValues : Record<string,boolean|number|string|null>
}

export interface EvictSessionRequest {
	messageID : number
};

export interface UserInitializeRequest {
	durableObjectID : string
	telegramUserID : number
	telegramUserName : string
};

export interface TokenPairPositionTrackerInitializeRequest {
	durableObjectID : string
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

export interface ManuallyClosePositionRequest {
	positionID : string
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

export interface TelegramWebhookInfo {
	telegramUserID : number
	telegramUserName : string
	chatID : number /* The Telegram chat ID */
	messageID : number /* The telegram message ID */
	messageType : 'callback'|'message'|'command'|null
	command: string|null
	callbackData : CallbackData|null
	text : string|null
};

export interface CallbackButton {
	text: string,
	callback_data : string
};

export class CallbackData {
	menuCode : MenuCode
	menuArg? : string
	constructor(menuCode : MenuCode, menuArg ?: string) {
		this.menuCode = menuCode;
		this.menuArg = menuArg;		
	}
	static parse(callbackDataString : string) : CallbackData {
		const tokens = callbackDataString.split(":").filter(x => !!x);
        if (tokens.length == 1) {
            return new CallbackData(MenuCode[tokens[0] as keyof typeof MenuCode], undefined);
        }
        else {
            return new CallbackData(MenuCode[tokens[0] as keyof typeof MenuCode], tokens[1]);
        }
	}
	toString() : string {
		return [this.menuCode, this.menuArg||''].join(":");
	}
};

export enum MenuDisplayMode {
	UpdateMenu,
	NewMenu
};

export interface MenuSpec {
	text: string,
	options : Array<Array<CallbackButton>>
	parseMode : 'HTML'|'MarkdownV2'
	mode : MenuDisplayMode
	forceReply : boolean
};

export enum MenuCode {
	Main = "Main",
	CreateWallet = "CreateWallet",
	Wallet = "Wallet",
	ListPositions = "ListPositions",
	Invite = "Invite",
	FAQ = "FAQ",
	Help = "Help",
	Error = "Error",
	
	PleaseEnterToken = "PleaseEnterToken",
	TransferFunds = "TransferFunds",
	RefreshWallet = "RefreshWallet",
	ExportWallet = "ExportWallet",
	ViewOpenPosition = "ViewOpenPosition",
	ClosePositionManuallyAction = "ClosePositionManuallyAction",

	// Trailing Stop Loss: set buy quantity in vsToken units
	TrailingStopLossEntryBuyQuantityMenu = "TrailingStopLossEntryBuyQuantityMenu",
	TrailingStopLossEnterBuyQuantityKeypad = "TrailingStopLossEnterBuyQuantityKeypad",
	TrailingStopLossEnterBuyQuantitySubmit = "TrailingStopLossEnterBuyQuantitySubmit",

	// Trailing Stop Loss: set vsToken UI
	TrailingStopLossPickVsTokenMenu = "TrailingStopLossPickVsToken",
	TrailingStopLossPickVsTokenMenuSubmit = "TrailingStopLossPickVsTokenMenuSubmit",
	
	// Trailing Stop Loss: set slippage tolerance UI
	TrailingStopLossSlippageToleranceMenu = "TrailingStopLossSlippageToleranceMenu",
	TrailingStopLossCustomSlippageToleranceKeypad = "TrailingStopLossCustomSlippageToleranceKeypad",
	TrailingStopLossCustomSlippageToleranceKeypadSubmit = "TrailingStopLossCustomSlippageToleranceKeypad",

	// Trailing Stop Loss: set trigger percent UI
	TrailingStopLossTriggerPercentMenu = "TrailingStopLossTriggerPercentMenu",
	TrailingStopLossCustomTriggerPercentCustomKeypad = "TrailingStopLossCustomTriggerPercentCustomKeypad", 
	TrailingStopLossCustomTriggerPercentCustomKeypadSubmit = "TrailingStopLossCustomTriggerPercentCustomKeypadSubmit", 

	// Trailing Stop Loss: auto-retry sell if slippage tolerance exceeded?
	TrailingStopLossChooseAutoRetrySellMenu = "TrailingStopLossChooseAutoRetrySellMenu",
	TrailingStopLossChooseAutoRetrySellSubmit = "TrailingStopLossChooseAutoRetrySellSubmit",

	
	TrailingStopLossConfirmMenu = "TrailingStopLossConfirmMenu",
	TrailingStopLossEditorFinalSubmit = "TrailingStopLossEditorFinalSubmit",
};

export enum SessionKey {
	PositionID = "positionID",
	Token = "token",
	TokenAddress = "tokenAddress",
	VsToken = "vsToken",
	VsTokenAddress = "vsTokenAddress",
	VsTokenAmt = "vsTokenAmt",
	PositionType = "positionType",
	TrailingStopLossSlippageTolerance = "trailingStopLossSlippageTolerance",
	TrailingStopLossTriggerPercent = "trailingStopLossTriggerPercent",	
	TrailingStopLossRetrySellIfPartialFill = "trailingStopLossRetrySellIfPartialFill",
	TrailingStopLossRetrySellIfSlippageToleranceExceeded = "trailingStopLossRetrySellIfSlippageToleranceExceeded"
}

export enum UserDOFetchMethod {
	get = "get",
	initialize = "initialize",
	storeSessionValues = "storeSessionValues",
	getSessionValues = "getSessionValues",
	deleteSession = "deleteSession",
	generateWallet = "generateWallet",
	requestNewPosition = "requestNewPosition",
	getPosition = "getPosition",
	manuallyClosePosition = "manuallyClosePosition",
	notifyPositionFillSuccess = "notifyPositionFillSuccess",
	notifyPositionFillFailure = "notifyPositionFillFailure",
	notifyPositionAutoClosed = "notifyPositionAutoClosed",
	notifyPositionsAutoClosed = "notifyPositionsAutoClosed"
}

export function makeUserDOFetchRequest<T>(method : UserDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://userDO/${method.toString()}`
	if (body != null) {
		return makeJSONRequest(url, body);
	}
	else {
		return makeRequest(url, httpMethod);
	}
}

export enum TokenPairPositionTrackerDOFetchMethod {
	initialize  = "initialize",
	updatePrice = "updatePrice",
	manuallyClosePosition = "manuallyClosePosition",
	requestNewPosition = "requestNewPosition",
	getPositions = "getPositions"
}

export function makeTokenPairPositionTrackerDOFetchRequest<T>(method : TokenPairPositionTrackerDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://tokenPairPositionTrackerDO/${method.toString()}`
	if (body == null) {
		return makeJSONRequest(url, body);
	}
	else {
		return makeRequest(url, httpMethod);
	}
}

export enum PolledTokenPairListDOFetchMethod {
	initialize = "initialize"
}

export function makePolledTokenPairListDOFetchRequest<T>(method : PolledTokenPairListDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://polledTokenPairListDO/${method.toString()}`
	if (body == null) {
		return makeJSONRequest(url, body);
	}
	else {
		return makeRequest(url, httpMethod);
	}
}
