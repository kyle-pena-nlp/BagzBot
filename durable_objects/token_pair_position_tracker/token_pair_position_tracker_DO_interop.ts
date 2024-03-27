import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { Position } from "../../positions";
import { makeJSONRequest, makeRequest } from "../../util";
import { GetPositionFromPriceTrackerRequest, GetPositionFromPriceTrackerResponse } from "./actions/get_position";
import { ListPositionsByUserRequest, ListPositionsByUserResponse } from "./actions/list_positions_by_user";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";
import { MarkPositionAsOpenRequest, MarkPositionAsOpenResponse } from "./actions/mark_position_as_open";
import { RemovePositionRequest, RemovePositionResponse } from "./actions/remove_position";
import { UpsertPositionsRequest, UpsertPositionsResponse } from "./actions/upsert_positions";
import { WakeupRequest, WakeupResponse } from "./actions/wake_up";

export enum TokenPairPositionTrackerDOFetchMethod {
	wakeUp = "wakeUp",
	updatePrice = "updatePrice",
	upsertPositions = "upsertPositions",
	markPositionAsClosing = "markPositionAsClosing",
	markPositionAsClosed = "markPositionAsClosed",
	markPositionAsOpen = "markPositionAsOpen",	
	removePosition = "removePosition",
	getTokenPrice = "getTokenPrice",
	getPosition = "getPosition",
	listPositionsByUser = "listPositionsByUser"
}



export function parseTokenPairPositionTrackerDOFetchMethod(value : string) : TokenPairPositionTrackerDOFetchMethod|null {
	return Object.values(TokenPairPositionTrackerDOFetchMethod).find(x => x === value)||null;
}

export async function getPosition(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<Position|undefined> {
	const method = TokenPairPositionTrackerDOFetchMethod.getPosition;
	const request : GetPositionFromPriceTrackerRequest = { positionID, tokenAddress, vsTokenAddress };
	const response = await sendJSONRequestToTokenPairPositionTracker<GetPositionFromPriceTrackerRequest,GetPositionFromPriceTrackerResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response.maybePosition;
}

export async function upsertPosition(position : Position, env : Env) : Promise<UpsertPositionsResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.upsertPositions;
	const request : UpsertPositionsRequest = { positions: [position], tokenAddress: position.token.address, vsTokenAddress: position.vsToken.address };
	const response = await sendJSONRequestToTokenPairPositionTracker<UpsertPositionsRequest,UpsertPositionsResponse>(method, request, request.tokenAddress, request.vsTokenAddress, env);
	return response;
}

// this straight-up deletes the position, doesn't just mark it as closed.
export async function removePosition(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<RemovePositionResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.removePosition;
	const request : RemovePositionRequest = { positionID, tokenAddress, vsTokenAddress };
	const response = await sendJSONRequestToTokenPairPositionTracker<RemovePositionRequest,RemovePositionResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response;
}

export async function listPositionsByUser(telegramUserID : number, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<Position[]> {
	const request : ListPositionsByUserRequest = {
		telegramUserID,
		tokenAddress,
		vsTokenAddress
	};
	const method = TokenPairPositionTrackerDOFetchMethod.listPositionsByUser;
	const response = await sendJSONRequestToTokenPairPositionTracker<ListPositionsByUserRequest,ListPositionsByUserResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response.positions;
}

/* This should be called on cold-start */
export async function wakeUpTokenPairPositionTracker(tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<WakeupResponse> {
	const body = { 
		tokenAddress: tokenAddress, 
		vsTokenAddress : vsTokenAddress 
	};
	const response = await sendJSONRequestToTokenPairPositionTracker<WakeupRequest,WakeupResponse>(
		TokenPairPositionTrackerDOFetchMethod.wakeUp, 
		body, 
		tokenAddress, 
		vsTokenAddress, 
		env);
	return response;
}



export async function markAsClosed(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<MarkPositionAsClosedResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.markPositionAsClosed;
	const request : MarkPositionAsClosedRequest = { positionID, tokenAddress, vsTokenAddress };
	return await sendJSONRequestToTokenPairPositionTracker<MarkPositionAsClosedRequest,MarkPositionAsClosedResponse>(
		method, 
		request, 
		request.tokenAddress, 
		request.vsTokenAddress, 
		env);
}

export async function markAsClosing(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<MarkPositionAsClosingResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.markPositionAsClosing;
	const request : MarkPositionAsClosingRequest = { positionID, tokenAddress, vsTokenAddress };
	return await sendJSONRequestToTokenPairPositionTracker<MarkPositionAsClosingRequest,MarkPositionAsClosingResponse>(
		method,
		request,
		request.tokenAddress,
		request.tokenAddress,
		env);
}

export async function markAsOpen(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<MarkPositionAsOpenResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.markPositionAsOpen;
	const request : MarkPositionAsOpenRequest = { positionID, tokenAddress, vsTokenAddress };
	const response = await sendJSONRequestToTokenPairPositionTracker<MarkPositionAsOpenRequest,MarkPositionAsOpenResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response;
}

export async function importNewPosition(position : Position, env : Env) : Promise<UpsertPositionsResponse> {
	const requestBody : UpsertPositionsRequest = { 
		positions : [position], 
		tokenAddress: position.token.address, 
		vsTokenAddress: position.vsToken.address
	};
	const method = TokenPairPositionTrackerDOFetchMethod.upsertPositions;
	const tokenAddress = position.token.address;
	const vsTokenAddress = position.vsToken.address;
	return await sendJSONRequestToTokenPairPositionTracker<UpsertPositionsRequest,UpsertPositionsResponse>(method, requestBody, tokenAddress, vsTokenAddress, env);
}

async function sendJSONRequestToTokenPairPositionTracker<TRequestBody,TResponseBody>(method : TokenPairPositionTrackerDOFetchMethod, requestBody : TRequestBody, tokenAddress : string, vsTokenAddress : string, env : Env) {
	const tokenPairPositionTrackerDO = getTokenPairPositionTrackerDO(tokenAddress, vsTokenAddress, env);
	const jsonRequest = makeJSONRequest(`http://tokenPairPositionTracker/${method.toString()}`, requestBody);
	const response = await tokenPairPositionTrackerDO.fetch(jsonRequest);
	const responseBody = await response.json();
	return responseBody as TResponseBody;
}

// TODO: replace with non-anonymous interfaces
export async function getTokenPrice(tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<DecimalizedAmount|undefined> {
	const method = TokenPairPositionTrackerDOFetchMethod.getTokenPrice;
	const requestBody = {};
	const priceResponse = await sendJSONRequestToTokenPairPositionTracker<{},{price : DecimalizedAmount|undefined }>(method, requestBody, tokenAddress, vsTokenAddress, env);
	return priceResponse.price;
}

function getTokenPairPositionTrackerDO(tokenAddress : string, vsTokenAddress : string, env : Env) {
	const namespace : DurableObjectNamespace = env.TokenPairPositionTrackerDO;
	const id = namespace.idFromName(`${tokenAddress}:${vsTokenAddress}`);
	const stub = namespace.get(id);
	return stub;
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
