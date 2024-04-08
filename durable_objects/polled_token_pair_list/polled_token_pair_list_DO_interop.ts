import { Env } from "../../env";
import { makeJSONRequest, makeRequest } from "../../util";
import { ForceRefreshTokensRequest as RebuildTokensListRequest, ForceRefreshTokensResponse as RebuildTokensListResponse } from "./actions/force_refresh_tokens";
import { GetTokenInfoRequest, GetTokenInfoResponse } from "./actions/get_token_info";

export enum PolledTokenPairListDOFetchMethod {
	initialize = "initialize",
    getTokenInfo = "getTokenInfo",
	rebuildTokensList = "rebuildTokensList"
}



export function parsePolledTokenPairListDOFetchMethod(value : string) : PolledTokenPairListDOFetchMethod|null {
	return Object.values(PolledTokenPairListDOFetchMethod).find(x => x === value)||null;
}

function makePolledTokenPairListDOFetchRequest<T>(method : PolledTokenPairListDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://polledTokenPairListDO/${method.toString()}`;
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

export async function getTokenInfo(tokenAddress : string, env : Env) : Promise<GetTokenInfoResponse> {
	const body : GetTokenInfoRequest = { tokenAddress : tokenAddress };
	const response = await sendJSONRequestToDO<GetTokenInfoRequest,GetTokenInfoResponse>(PolledTokenPairListDOFetchMethod.getTokenInfo, body, env);
	return response;
}

export async function forceRebuildTokensList(env : Env) : Promise<RebuildTokensListResponse> {
	const request : RebuildTokensListRequest = { };
	const method = PolledTokenPairListDOFetchMethod.rebuildTokensList;
	const response = await sendJSONRequestToDO<RebuildTokensListRequest,RebuildTokensListResponse>(method,request,env);
	return response;
}
