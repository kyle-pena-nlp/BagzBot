
export interface Env {
	
	// display name of bot
	TELEGRAM_BOT_DISPLAY_NAME : string
	TELEGRAM_BOT_INSTANCE_DISPLAY_NAME : string
	TELEGRAM_BOT_TAGLINE : string
	
	// do not change this string EVER post launch
	ENVIRONMENT : string

	// telegram username of bot
	TELEGRAM_BOT_USERNAME : string
	// endpoint for talking to telegram (is 127.0.0.1 if in dev environment)
	TELEGRAM_BOT_SERVER_URL : string
	// id assigned to bot
	TELEGRAM_BOT_ID : string		

	SECRET__TELEGRAM_BOT_TOKEN : string	
	SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN : string
	SECRET__TELEGRAM_API_ID : string
	SECRET__TELEGRAM_API_HASH : string
	SECRET__HELIUS_API_KEY : string	
	SECRET__PK_AES_SALT : string	
	SECRET__FEE_ACCOUNT_PUBLIC_KEY : string

	// don't access this directly, use getRPCUrl, per below.
	RPC_ENDPOINT_URL : string
	JUPITER_PRICE_API_URL : string
	JUPITER_QUOTE_API_URL : string
	JUPITER_SWAP_API_URL : string
	JUPITER_SWAP_PROGRAM_ID : string
	JUPITER_SWAP_PROGRAM_SLIPPAGE_ERROR_CODE : string
	JUPITER_SWAP_PROGRAM_FEE_ACCOUNT_NOT_INITIALIZED_ERROR_CODE : string
	JUPITER_SWAP_PROGRAM_INSUFFICIENT_LAMPORTS_ERROR_CODE : string
	JUPITER_USE_DYNAMIC_COMPUTE_UNIT_LIMIT : string
	PLATFORM_FEE_BPS : string
	DEFAULT_TLS_VS_TOKEN_FRACTION : string
	RPC_REBROADCAST_DELAY_MS : string
	RPC_REATTEMPT_CONFIRM_DELAY : string
	RPC_CONFIRM_TIMEOUT_MS : string
	RPC_MAX_CONFIRM_EXCEPTIONS : string
	RPC_SEND_RAW_TRANSACTION_MAX_RETRIES : string
	MAX_BLOCK_FINALIZATION_TIME_MS : string

	IS_BETA_CODE_GATED : string
	BETA_CODE_GATE_EXCEPTIONS : string
	WALLET_BALANCE_REFRESH_INTERVAL_MS : string
	ADMIN_TELEGRAM_USER_IDS: string
	SUPER_ADMIN_USER_ID : string
	POLLING_ON : string
	USER_PNL_CALCULATION_REFRESH_MS : string
	TOKEN_LIST_REFRESH_TIMEOUT : string
	SOL_BUY_LIMIT : string
	PRICE_POLL_INTERVAL_MS : string
	FORBIDDEN_TOKENS : string
	TX_TIMEOUT_MS : string

	UserDO : any // i'd like to strongly type this as DurableObjectNamespace, but can't for technical reasons
	TokenPairPositionTrackerDO : any // ditto
	PolledTokenPairListDO : any // ditto
	BetaInviteCodesDO : any
	HeartbeatDO: any
};

export function getRPCUrl(env : Env) {
	return `${env.RPC_ENDPOINT_URL}?api-key=${env.SECRET__HELIUS_API_KEY}`
}