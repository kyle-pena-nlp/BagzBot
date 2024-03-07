import { TokenInfo } from "../../common";
import { Env } from "../../env";
import { makeJSONRequest, makeRequest } from "../../util/http_helpers";

export interface ValidateTokenRequest {
    tokenAddress: string
};

export interface ValidateTokenResponse {
	type : 'valid'|'invalid'
	tokenInfo? : TokenInfo
};

export enum PolledTokenPairListDOFetchMethod {
	initialize = "initialize",
    validateToken = "validateToken"
}

export function parsePolledTokenPairListDOFetchMethod(value : string) : PolledTokenPairListDOFetchMethod|null {
	return Object.values(PolledTokenPairListDOFetchMethod).find(x => x === value)||null;
}

function makePolledTokenPairListDOFetchRequest<T>(method : PolledTokenPairListDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://polledTokenPairListDO/${method.toString()}`
	if (body != null) {
		return makeJSONRequest(url, body);
	}
	else {
		return makeRequest(url, httpMethod);
	}
}

function getPolledTokenPairListDO(env : Env) : any {
	const namespace = env.PolledTokenPairListDO as DurableObjectNamespace;
	const id = namespace.idFromName('singleton');
	const durableObject = namespace.get(id);
	return durableObject;
}

async function sendJSONRequestToDO<TRequest,TResponse>(method : PolledTokenPairListDOFetchMethod, body: TRequest, env : Env) : Promise<TResponse> {
	const request = makePolledTokenPairListDOFetchRequest(method, body);
	const userDO = getPolledTokenPairListDO(env);
	const response = await userDO.fetch(request);
	const jsonResponse = await response.json();
	return jsonResponse as TResponse;
}

export async function validateToken(tokenAddress : string, env : Env) : Promise<ValidateTokenResponse> {
	const body : ValidateTokenRequest = { tokenAddress : tokenAddress };
	const response = sendJSONRequestToDO<ValidateTokenRequest,ValidateTokenResponse>(PolledTokenPairListDOFetchMethod.validateToken, body, env);
	return response;
}
