
export interface Env {
	ENVIRONMENT : string
	TELEGRAM_BOT_USERNAME : string
	TELEGRAM_BOT_SERVER_URL : string
	TELEGRAM_BOT_ID : string
	TELEGRAM_BOT_TOKEN : string	
	TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN : string
	TELEGRAM_API_ID : string
	TELEGRAM_API_HASH : string
	RPC_ENDPOINT_URL : string
	HELIUS_API_KEY : string
	JUPITER_PRICE_API_URL : string
	JUPITER_QUOTE_API_URL : string
	JUPITER_SWAP_API_URL : string
	JUPITER_SWAP_PROGRAM_ID : string
	JUPITER_SWAP_PROGRAM_SLIPPAGE_ERROR_CODE : string
	JUPITER_SWAP_PROGRAM_FEE_ACCOUNT_NOT_INITIALIZED_ERROR_CODE : string
	JUPITER_SWAP_PROGRAM_INSUFFICIENT_LAMPORTS_ERROR_CODE : string
	JUPITER_USE_DYNAMIC_COMPUTE_UNIT_LIMIT : string
	PLATFORM_FEE_BPS : string
	FEE_ACCOUNT_PUBLIC_KEY : string
	DEFAULT_TLS_VS_TOKEN_FRACTION : string
	RPC_REBROADCAST_DELAY_MS : string
	RPC_REATTEMPT_CONFIRM_DELAY : string
	RPC_CONFIRM_TIMEOUT_MS : string
	RPC_MAX_CONFIRM_EXCEPTIONS : string
	MAX_BLOCK_FINALIZATION_TIME_MS : string
	PK_AES_SALT : string
	IS_BETA_CODE_GATED : string
	BETA_CODE_GATE_EXCEPTIONS : string
	WALLET_BALANCE_REFRESH_INTERVAL_MS : string
	ADMIN_TELEGRAM_USER_IDS: string
	SUPER_ADMIN_USER_ID : string
	START_POLLING_ON_START : string
	POLLING_ON : string

	UserDO : any // i'd like to strongly type this as DurableObjectNamespace, but can't for technical reasons
	TokenPairPositionTrackerDO : any // ditto
	PolledTokenPairListDO : any // ditto
	BetaInviteCodesDO : any
};

/*
// TODO: this, with errors if parses are wrong
export class ParsedEnv {
	env: Env
	environment : string
	telegramBotServerUrl : string
	telegramBotToken : string
	te
	constructor (env : Env) {
		this.env = env;

	}
}
*/