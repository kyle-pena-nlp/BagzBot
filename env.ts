
export interface Env {
	ENVIRONMENT : string
	TELEGRAM_BOT_SERVER_URL : string
	TELEGRAM_BOT_TOKEN : string
	TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN : string
	TELEGRAM_API_ID : string
	TELEGRAM_API_HASH : string
	RPC_ENDPOINT_URL : string
	V0_HELIUS_RPC_TRANSACTION_PARSING_URL: string
	HELIUS_API_KEY : string
	JUPITER_PRICE_API_URL : string
	JUPITER_QUOTE_API_URL : string
	JUPITER_SWAP_API_URL : string
	JUPITER_SWAP_PROGRAM_ID : string
	JUPITER_SWAP_PROGRAM_SLIPPAGE_ERROR_CODE : string
	PLATFORM_FEE_BPS : string
	FEE_ACCOUNT_PUBLIC_KEY : string
	UserDO : any // i'd like to strongly type this as DurableObjectNamespace, but can't for technical reasons
	TokenPairPositionTrackerDO : any // ditto
	PolledTokenPairListDO : any // ditto
};
