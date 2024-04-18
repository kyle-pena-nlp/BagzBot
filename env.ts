import { strictParseBoolean, tryParseInt } from "./util"

export interface Env {
	
	// display name of bot
	TELEGRAM_BOT_DISPLAY_NAME : string
	TELEGRAM_BOT_INSTANCE_DISPLAY_NAME : string
	TELEGRAM_BOT_TAGLINE : string

	MAX_BETA_INVITE_CODE_CHAIN_DEPTH : string
	INVITE_CODES_PER_USER : string	
	
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
	// can be lamports or the token in question.  instruction index differentiates these cases.
	JUPITER_SWAP_PROGRAM_INSUFFICIENT_BALANCE_ERROR_CODE : string
	JUPITER_USE_DYNAMIC_COMPUTE_UNIT_LIMIT : string
	JUPITER_SWAP_PROGRAM_TOKEN_ACCOUNT_FROZEN_ERROR_CODE : string
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
	CONFIRM_TIMEOUT_MS : string
	SECRET__QUICKNODE_API_KEY : string
	USE_QUICKNODE : string
	QUICKNODE_RPC_URL : string
	USE_METIS : string
	METIS_PRICE_API_URL : string
	METIS_QUOTE_API_URL : string
	METIS_SWAP_API_URL : string
	DOWN_FOR_MAINTENANCE : string
	TEST_NO_ADMINS_MODE : string
	// feature switches
	REBUILD_TOKENS_CRON_JOB: string
	TX_SIM_BEFORE_BUY : string
	ALLOW_CHOOSE_AUTO_DOUBLE_SLIPPAGE : string
	JUP_QUOTE_RESTRICT_INTERMEDIATE_TOKENS : string
	OTHER_SELL_FAILURES_TO_DEACTIVATE : string
	ALLOW_PRIORITY_FEE_MULTIPLIERS : string

	UserDO : any // i'd like to strongly type this as DurableObjectNamespace, but can't for technical reasons
	TokenPairPositionTrackerDO : any // ditto
	PolledTokenPairListDO : any // ditto
	BetaInviteCodesDO : any
	HeartbeatDO: any
};

export function isUserBetaCodeExempt(telegramUserID : number, env : Env) {
	return env.BETA_CODE_GATE_EXCEPTIONS.split(",").map(x => tryParseInt(x)).includes(telegramUserID);
}

export function getRPCUrl(env : Env) {
	if (strictParseBoolean(env.USE_QUICKNODE)) {
		return `${env.QUICKNODE_RPC_URL}/${env.SECRET__QUICKNODE_API_KEY}/`
	}
	else {
		return `${env.RPC_ENDPOINT_URL}?api-key=${env.SECRET__HELIUS_API_KEY}`
	}
}

export function getPriceAPIURL(env : Env) {
	if (strictParseBoolean(env.USE_METIS)) {
		return env.METIS_PRICE_API_URL;
	}
	else {
		return env.JUPITER_PRICE_API_URL;
	}
}

export function getSwapAPIUrl(env : Env) {
	if (strictParseBoolean(env.USE_METIS)) {
		return env.METIS_SWAP_API_URL;
	}
	else {
		return env.JUPITER_SWAP_API_URL;
	}
}

export function getQuoteAPIURL(env : Env) {
	if (strictParseBoolean(env.USE_METIS)) {
		return env.METIS_QUOTE_API_URL;
	}
	else {
		return env.JUPITER_QUOTE_API_URL;
	}
}