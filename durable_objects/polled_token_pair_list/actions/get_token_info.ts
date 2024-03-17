import { TokenInfo } from "../../../tokens/token_info";

export interface GetTokenInfoRequest {
    tokenAddress: string
};

export interface GetTokenInfoResponse {
	type : 'valid'|'invalid'
	tokenInfo? : TokenInfo
};