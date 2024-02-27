import { makeJSONRequest, makeRequest } from "./http_helpers";

export interface ValidateTokenRequest {
    tokenAddress: string
};

export interface ValidateTokenResponse {
	type : 'valid'|'invalid'|'tryagain'
	token? : string
    tokenAddress? : string
	logoURI? : string

};

export enum PolledTokenPairListDOFetchMethod {
	initialize = "initialize",
    validateToken = "validateToken"
}

export function makePolledTokenPairListDOFetchRequest<T>(method : PolledTokenPairListDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://polledTokenPairListDO/${method.toString()}`
	if (body != null) {
		return makeJSONRequest(url, body);
	}
	else {
		return makeRequest(url, httpMethod);
	}
}
