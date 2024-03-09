import { Position } from "../../positions/positions";
import { ImportNewPositionsRequest, ImportNewPositionsResponse } from "./actions/import_new_positions";
import { makeJSONRequest, makeRequest } from "../../util/http_helpers";
import { Env } from "../../env";

export enum TokenPairPositionTrackerDOFetchMethod {
	initialize  = "initialize",
	updatePrice = "updatePrice",
	manuallyClosePosition = "manuallyClosePosition",
	requestNewPosition = "requestNewPosition",
	getPositions = "getPositions",
	importNewOpenPositions = "importNewOpenPositions"
}

export function parseTokenPairPositionTrackerDOFetchMethod(value : string) : TokenPairPositionTrackerDOFetchMethod|null {
	return Object.values(TokenPairPositionTrackerDOFetchMethod).find(x => x === value)||null;
}

export function makeTokenPairPositionTrackerDOFetchRequest<T>(method : TokenPairPositionTrackerDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://tokenPairPositionTrackerDO/${method.toString()}`
	if (body != null) {
		return makeJSONRequest(url, body);
	}
	else {
		return makeRequest(url, httpMethod);
	}
}

export async function importNewPosition(position : Position, env : Env) : Promise<ImportNewPositionsResponse> {
	const requestBody : ImportNewPositionsRequest = { positions : [position] };
	const method = TokenPairPositionTrackerDOFetchMethod.importNewOpenPositions;
	const tokenAddress = position.token.address;
	const vsTokenAddress = position.vsToken.address;
	return await sendJSONRequestToTokenPairPositionTracker<ImportNewPositionsRequest,ImportNewPositionsResponse>(method, requestBody, tokenAddress, vsTokenAddress, env);
}

async function sendJSONRequestToTokenPairPositionTracker<TRequestBody,TResponseBody>(method : TokenPairPositionTrackerDOFetchMethod, requestBody : TRequestBody, tokenAddress : string, vsTokenAddress : string, env : Env) {
	const tokenPairPositionTrackerDO = getTokenPairPositionTrackerDO(tokenAddress, vsTokenAddress, env);
	const jsonRequest = makeJSONRequest(`http://tokenPairPositionTracker/{method.toString()}`, requestBody);
	const response = await tokenPairPositionTrackerDO.fetch(jsonRequest);
	const responseBody = await response.json();
	return responseBody as TRequestBody;
}

function getTokenPairPositionTrackerDO(tokenAddress : string, vsTokenAddress : string, env : Env) {
	const namespace : DurableObjectNamespace = env.TokenPairPositionTrackerDO;
	const id = namespace.idFromName(`${tokenAddress}:${vsTokenAddress}`);
	const stub = namespace.get(id);
	return stub;
}