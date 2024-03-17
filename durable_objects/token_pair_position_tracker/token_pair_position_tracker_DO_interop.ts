import { Env } from "../../env";
import { Position } from "../../positions";
import { makeJSONRequest, makeRequest } from "../../util";
import { ImportNewPositionsRequest, ImportNewPositionsResponse } from "./actions/import_new_positions";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";


export enum TokenPairPositionTrackerDOFetchMethod {
	initialize  = "initialize",
	updatePrice = "updatePrice",
	importNewOpenPositions = "importNewOpenPositions",
	markPositionAsClosing = "markPositionAsClosing",
	markPositionAsClosed = "markPositionAsClosed"
}

export function parseTokenPairPositionTrackerDOFetchMethod(value : string) : TokenPairPositionTrackerDOFetchMethod|null {
	return Object.values(TokenPairPositionTrackerDOFetchMethod).find(x => x === value)||null;
}

export function makeTokenPairPositionTrackerDOFetchRequest<T>(method : TokenPairPositionTrackerDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://tokenPairPositionTrackerDO/${method.toString()}`;
	if (body != null) {
		return makeJSONRequest(url, body);
	}
	else {
		return makeRequest(url, httpMethod);
	}
}

export async function markPositionAsClosedInTokenPairPositionTracker(request : MarkPositionAsClosedRequest, env : Env) : Promise<MarkPositionAsClosedResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.markPositionAsClosed;
	return await sendJSONRequestToTokenPairPositionTracker<MarkPositionAsClosedRequest,MarkPositionAsClosedResponse>(
		method, 
		request, 
		request.tokenAddress, 
		request.vsTokenAddress, 
		env);
}

export async function markPositionAsClosingInTokenPairPositionTracker(request : MarkPositionAsClosingRequest, env : Env) : Promise<MarkPositionAsClosingResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.markPositionAsClosing;
	return await sendJSONRequestToTokenPairPositionTracker<MarkPositionAsClosingRequest,MarkPositionAsClosingResponse>(
		method,
		request,
		request.tokenAddress,
		request.tokenAddress,
		env);
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