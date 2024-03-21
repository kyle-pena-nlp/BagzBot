import { TokenInfo } from "../../../tokens/token_info";

export interface GetTokenInfoRequest {
    tokenAddress: string
};

export interface InvalidTokenResponse {
	type : 'invalid'
	tokenInfo : null
}

export interface ValidTokenResponse {
	type : 'valid'
	tokenInfo : TokenInfo
}

export type GetTokenInfoResponse = InvalidTokenResponse | ValidTokenResponse;

export function isValidTokenInfoResponse(info : GetTokenInfoResponse) : info is ValidTokenResponse {
	return info.type === 'valid';
}

export function isInvalidTokenInfoResponse(info : GetTokenInfoResponse) : info is InvalidTokenResponse {
	return info.type === 'invalid';
}