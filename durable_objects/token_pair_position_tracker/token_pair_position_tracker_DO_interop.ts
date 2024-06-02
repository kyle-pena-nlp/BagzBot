import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { makeJSONRequest, makeRequest } from "../../http";
import { Position, PositionStatus } from "../../positions";
import { AdminDeleteAllInTrackerRequest, AdminDeleteAllInTrackerResponse } from "./actions/admin_delete_all_positions_in_tracker";
import { AdminDeleteClosedPositionsForUserInTrackerRequest, AdminDeleteClosedPositionsForUserInTrackerResponse } from "./actions/admin_delete_closed_positions_for_user_in_tracker";
import { AdminDeletePositionByIDFromTrackerRequest, AdminDeletePositionByIDFromTrackerResponse } from "./actions/admin_delete_position_by_id_from_tracker";
import { GetDeactivatedPositionFromTrackerRequest, GetDeactivatedPositionFromTrackerResponse } from "./actions/get_frozen_position";
import { GetPositionFromPriceTrackerRequest, GetPositionFromPriceTrackerResponse } from "./actions/get_position";
import { GetPositionAndMaybePNLFromPriceTrackerRequest, GetPositionAndMaybePNLFromPriceTrackerResponse } from "./actions/get_position_and_maybe_pnl";
import { GetPositionCountsFromTrackerRequest, GetPositionCountsFromTrackerResponse } from "./actions/get_position_counts_from_tracker";
import { GetTokenPriceRequest, GetTokenPriceResponse } from "./actions/get_token_price";
import { ListClosedPositionsFromTrackerRequest, ListClosedPositionsFromTrackerResponse } from "./actions/list_closed_positions_from_tracker";
import { ListDeactivatedPositionsInTrackerRequest, ListDeactivatedPositionsInTrackerResponse } from "./actions/list_frozen_positions_in_tracker";
import { ListPositionsByUserRequest, ListPositionsByUserResponse } from "./actions/list_positions_by_user";
import { PositionExistsInTrackerRequest, PositionExistsInTrackerResponse } from "./actions/position_exists_in_tracker";
import { RemovePositionRequest, RemovePositionResponse } from "./actions/remove_position";
import { PositionAndMaybePNL } from "./model/position_and_PNL";

export enum TokenPairPositionTrackerDOFetchMethod {
	wakeUp = "wakeUp",
	//markPositionAsClosing = "markPositionAsClosing",
	//markPositionAsClosed = "markPositionAsClosed",
	//markPositionAsOpen = "markPositionAsOpen",	
	removePosition = "removePosition",
	getTokenPrice = "getTokenPrice",
	getPositionAndMaybePNL = "getPositionAndMaybePNL",
	getPosition = "getPosition",
	listPositionsByUser = "listPositionsByUser",
	//editTriggerPercentOnOpenPosition = "editTriggerPercentOnOpenPosition",
	//setSellAutoDoubleOnOpenPosition = "setSellAutoDoubleOnOpenPosition",
	adminDeleteAllInTracker = "adminDeleteAllInTracker",
	positionExists = "positionExists",
	//markBuyAsConfirmed = "markBuyAsConfirmed",
	//setSellSlippagePercentOnOpenPosition = "setSellSlippagePercentOnOpenPosition",
	listClosedPositionsFromTracker = "listClosedPositionsFromTracker",
	insertPosition = "insertPosition",
	updatePosition = "updatePosition",
	getPositionCounts = "getPositionCounts",
	adminDeleteClosedPositionsForUser = "adminDeleteClosedPositionsForUser",
	adminDeletePositionByIDFromTracker = "adminDeletePositionByIDFromTracker",
	//deactivatePosition = "deactivatePosition",
	//reactivatePosition = "reactivatePosition",
	listDeactivatedPositions = "listDeactivatedPositions",
	getDeactivatedPosition = "getDeactivatedPosition",
	//incrementOtherSellFailureCount = "incrementOtherSellFailureCount",
	//doubleSellSlippage = "doubleSellSlippage",
	//setOpenPositionSellPriorityFee = "setOpenPositionSellPriorityFee"
}





export async function getDeactivatedPositionFromTracker(telegramUserID : number, positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<GetDeactivatedPositionFromTrackerResponse> {
	const request : GetDeactivatedPositionFromTrackerRequest = { telegramUserID, positionID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.getDeactivatedPosition;
	return await sendJSONRequestToTokenPairPositionTracker<GetDeactivatedPositionFromTrackerRequest,GetDeactivatedPositionFromTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
}





export async function listDeactivatedPositionsInTracker(userID : number, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<ListDeactivatedPositionsInTrackerResponse> {
	const request : ListDeactivatedPositionsInTrackerRequest = { userID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.listDeactivatedPositions;
	return await sendJSONRequestToTokenPairPositionTracker<ListDeactivatedPositionsInTrackerRequest,ListDeactivatedPositionsInTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
}

export async function adminDeletePositionByIDFromTracker(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<AdminDeletePositionByIDFromTrackerResponse> {
	const request : AdminDeletePositionByIDFromTrackerRequest = { positionID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.adminDeletePositionByIDFromTracker;
	const response = await sendJSONRequestToTokenPairPositionTracker<AdminDeletePositionByIDFromTrackerRequest,AdminDeletePositionByIDFromTrackerResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response;
}

export async function adminDeleteClosedPositionsForUser(telegramUserID : number, tokenAddress : string, vsTokenAddress : string,  env:Env) : Promise<AdminDeleteClosedPositionsForUserInTrackerResponse> {
	const request : AdminDeleteClosedPositionsForUserInTrackerRequest = { telegramUserID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.adminDeleteClosedPositionsForUser;
	const response = await sendJSONRequestToTokenPairPositionTracker<AdminDeleteClosedPositionsForUserInTrackerRequest,AdminDeleteClosedPositionsForUserInTrackerResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response;
}

export async function getPositionCountsFromTracker(tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<Record<PositionStatus,number>> {
	const request  : GetPositionCountsFromTrackerRequest = { tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.getPositionCounts;
	const response = await sendJSONRequestToTokenPairPositionTracker<GetPositionCountsFromTrackerRequest,GetPositionCountsFromTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
	return response.positionCounts;
}

export async function listClosedPositionsFromTracker(telegramUserID : number, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<ListClosedPositionsFromTrackerResponse> {
	const request : ListClosedPositionsFromTrackerRequest = { telegramUserID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.listClosedPositionsFromTracker;
	const response = await sendJSONRequestToTokenPairPositionTracker<ListClosedPositionsFromTrackerRequest,ListClosedPositionsFromTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
	return response;
}



export async function positionExistsInTracker(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<boolean> {
	const request : PositionExistsInTrackerRequest = { positionID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.positionExists;
	const response = await sendJSONRequestToTokenPairPositionTracker<PositionExistsInTrackerRequest,PositionExistsInTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
	return response.exists;
}

export async function _adminDeleteAll(userID : number, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<AdminDeleteAllInTrackerResponse> {
	const request : AdminDeleteAllInTrackerRequest =  { userID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.adminDeleteAllInTracker;
	return await sendJSONRequestToTokenPairPositionTracker<AdminDeleteAllInTrackerRequest,AdminDeleteAllInTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
}



export async function getPositionAndMaybePNL(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<PositionAndMaybePNL|undefined> {
	const method = TokenPairPositionTrackerDOFetchMethod.getPositionAndMaybePNL;
	const request : GetPositionAndMaybePNLFromPriceTrackerRequest = { positionID, tokenAddress, vsTokenAddress };
	const response = await sendJSONRequestToTokenPairPositionTracker<GetPositionAndMaybePNLFromPriceTrackerRequest,GetPositionAndMaybePNLFromPriceTrackerResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response.maybePosition;
}

export async function getPosition(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<Position|undefined> {
	const method = TokenPairPositionTrackerDOFetchMethod.getPosition;
	const request : GetPositionFromPriceTrackerRequest = { positionID, tokenAddress, vsTokenAddress };
	const response = await sendJSONRequestToTokenPairPositionTracker<GetPositionFromPriceTrackerRequest,GetPositionFromPriceTrackerResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response.maybePosition;
}



// this straight-up deletes the position, doesn't just mark it as closed.
export async function removePosition(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<RemovePositionResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.removePosition;
	const request : RemovePositionRequest = { positionID, tokenAddress, vsTokenAddress };
	const response = await sendJSONRequestToTokenPairPositionTracker<RemovePositionRequest,RemovePositionResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response;
}

export async function listPositionsByUser(telegramUserID : number, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<PositionAndMaybePNL[]> {
	const request : ListPositionsByUserRequest = {
		telegramUserID,
		tokenAddress,
		vsTokenAddress
	};
	const method = TokenPairPositionTrackerDOFetchMethod.listPositionsByUser;
	const response = await sendJSONRequestToTokenPairPositionTracker<ListPositionsByUserRequest,ListPositionsByUserResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response.positions;
}



async function sendJSONRequestToTokenPairPositionTracker<TRequestBody,TResponseBody>(method : TokenPairPositionTrackerDOFetchMethod, requestBody : TRequestBody, tokenAddress : string, vsTokenAddress : string, env : Env) {
	const tokenPairPositionTrackerDO = getTokenPairPositionTrackerDO(tokenAddress, vsTokenAddress, env);
	const jsonRequest = makeJSONRequest(`http://tokenPairPositionTracker/${method.toString()}`, requestBody);
	const response = await tokenPairPositionTrackerDO.fetch(jsonRequest);
	const responseBody = await response.json();
	return responseBody as TResponseBody;
}

export async function getTokenPrice(tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<DecimalizedAmount|null> {
	const method = TokenPairPositionTrackerDOFetchMethod.getTokenPrice;
	const requestBody = { tokenAddress, vsTokenAddress };
	const priceResponse = await sendJSONRequestToTokenPairPositionTracker<GetTokenPriceRequest,GetTokenPriceResponse>(method, requestBody, tokenAddress, vsTokenAddress, env);
	return priceResponse.price;
}

export class TokenPairKey {
	tokenAddress : string
	vsTokenAddress : string
	constructor(tokenAddress : string, vsTokenAddress : string) {
		this.tokenAddress = tokenAddress;
		this.vsTokenAddress = vsTokenAddress;
	}
	toString() : string {
		return `${this.tokenAddress}:${this.vsTokenAddress}`;
	}
	static parse(key : string) : TokenPairKey|null {
		const tokens = key.split(":")
		if (tokens.length !== 2) {
			return null;
		}
		return new TokenPairKey(tokens[0],tokens[1]);
	}
}

function getTokenPairPositionTrackerDO(tokenAddress : string, vsTokenAddress : string, env : Env) {
	const namespace : DurableObjectNamespace = env.TokenPairPositionTrackerDO;
	const id = namespace.idFromName(new TokenPairKey(tokenAddress, vsTokenAddress).toString());
	const stub = namespace.get(id);
	return stub;
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
