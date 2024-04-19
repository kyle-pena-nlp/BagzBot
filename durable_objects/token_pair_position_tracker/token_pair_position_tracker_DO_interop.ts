import { isTheSuperAdminUserID } from "../../admins";
import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { makeJSONRequest, makeRequest } from "../../http";
import { Position, PositionStatus } from "../../positions";
import { EditTriggerPercentOnOpenPositionResponse } from "../user/actions/edit_trigger_percent_on_open_position";
import { SetSellAutoDoubleOnOpenPositionResponse } from "../user/actions/set_sell_auto_double_on_open_position";
import { SellSellSlippagePercentageOnOpenPositionResponse } from "../user/actions/set_sell_slippage_percent_on_open_position";
import { ReactivatePositionInTrackerRequest, ReactivatePositionInTrackerResponse } from "./actions/activate_position_in_tracker";
import { AdminDeleteAllInTrackerRequest, AdminDeleteAllInTrackerResponse } from "./actions/admin_delete_all_positions_in_tracker";
import { AdminDeleteClosedPositionsForUserInTrackerRequest, AdminDeleteClosedPositionsForUserInTrackerResponse } from "./actions/admin_delete_closed_positions_for_user_in_tracker";
import { AdminDeletePositionByIDFromTrackerRequest, AdminDeletePositionByIDFromTrackerResponse } from "./actions/admin_delete_position_by_id_from_tracker";
import { DeactivatePositionInTrackerRequest, DeactivatePositionInTrackerResponse } from "./actions/deactivate_position_in_tracker";
import { DoubleSellSlippageInTrackerRequest, DoubleSellSlippageInTrackerResponse } from "./actions/double_sell_slippage_in_tracker";
import { EditTriggerPercentOnOpenPositionInTrackerRequest } from "./actions/edit_trigger_percent_on_open_position_in_tracker";
import { GetDeactivatedPositionFromTrackerRequest, GetDeactivatedPositionFromTrackerResponse } from "./actions/get_frozen_position";
import { GetPositionFromPriceTrackerRequest, GetPositionFromPriceTrackerResponse } from "./actions/get_position";
import { GetPositionAndMaybePNLFromPriceTrackerRequest, GetPositionAndMaybePNLFromPriceTrackerResponse } from "./actions/get_position_and_maybe_pnl";
import { GetPositionCountsFromTrackerRequest, GetPositionCountsFromTrackerResponse } from "./actions/get_position_counts_from_tracker";
import { GetTokenPriceRequest, GetTokenPriceResponse } from "./actions/get_token_price";
import { HasPairAddresses } from "./actions/has_pair_addresses";
import { IncrementOtherSellFailureCountInTrackerRequest, IncrementOtherSellFailureCountInTrackerResponse } from "./actions/increment_other_sell_failure_count_in_tracker";
import { InsertPositionRequest, InsertPositionResponse } from "./actions/insert_position";
import { ListClosedPositionsFromTrackerRequest, ListClosedPositionsFromTrackerResponse } from "./actions/list_closed_positions_from_tracker";
import { ListDeactivatedPositionsInTrackerRequest, ListDeactivatedPositionsInTrackerResponse } from "./actions/list_frozen_positions_in_tracker";
import { ListPositionsByUserRequest, ListPositionsByUserResponse } from "./actions/list_positions_by_user";
import { MarkBuyAsConfirmedRequest, MarkBuyAsConfirmedResponse } from "./actions/mark_buy_as_confirmed";
import { MarkPositionAsClosedRequest, MarkPositionAsClosedResponse } from "./actions/mark_position_as_closed";
import { MarkPositionAsClosingRequest, MarkPositionAsClosingResponse } from "./actions/mark_position_as_closing";
import { MarkPositionAsOpenRequest, MarkPositionAsOpenResponse } from "./actions/mark_position_as_open";
import { PositionExistsInTrackerRequest, PositionExistsInTrackerResponse } from "./actions/position_exists_in_tracker";
import { RemovePositionRequest, RemovePositionResponse } from "./actions/remove_position";
import { SetOpenPositionSellPriorityFeeInTrackerRequest, SetOpenPositionSellPriorityFeeInTrackerResponse } from "./actions/set_open_position_sell_priority_fee_in_tracker";
import { SetSellAutoDoubleOnOpenPositionInTrackerRequest } from "./actions/set_sell_auto_double_on_open_position_in_tracker";
import { SetSellSlippagePercentOnOpenPositionTrackerRequest } from "./actions/set_sell_slippage_percent_on_open_position";
import { UpdatePositionRequest, UpdatePositionResponse } from "./actions/update_position";
import { UpdatePriceRequest, UpdatePriceResponse } from "./actions/update_price";
import { WakeupTokenPairPositionTrackerRequest, WakeupTokenPairPositionTrackerResponse } from "./actions/wake_up";
import { PositionAndMaybePNL } from "./model/position_and_PNL";

export enum TokenPairPositionTrackerDOFetchMethod {
	wakeUp = "wakeUp",
	updatePrice = "updatePrice",
	markPositionAsClosing = "markPositionAsClosing",
	markPositionAsClosed = "markPositionAsClosed",
	markPositionAsOpen = "markPositionAsOpen",	
	removePosition = "removePosition",
	getTokenPrice = "getTokenPrice",
	getPositionAndMaybePNL = "getPositionAndMaybePNL",
	getPosition = "getPosition",
	listPositionsByUser = "listPositionsByUser",
	editTriggerPercentOnOpenPosition = "editTriggerPercentOnOpenPosition",
	setSellAutoDoubleOnOpenPosition = "setSellAutoDoubleOnOpenPosition",
	adminInvokeAlarm = "adminInvokeAlarm",
	adminDeleteAllInTracker = "adminDeleteAllInTracker",
	positionExists = "positionExists",
	markBuyAsConfirmed = "markBuyAsConfirmed",
	setSellSlippagePercentOnOpenPosition = "setSellSlippagePercentOnOpenPosition",
	listClosedPositionsFromTracker = "listClosedPositionsFromTracker",
	insertPosition = "insertPosition",
	updatePosition = "updatePosition",
	getPositionCounts = "getPositionCounts",
	adminDeleteClosedPositionsForUser = "adminDeleteClosedPositionsForUser",
	adminDeletePositionByIDFromTracker = "adminDeletePositionByIDFromTracker",
	deactivatePosition = "deactivatePosition",
	reactivatePosition = "reactivatePosition",
	listDeactivatedPositions = "listDeactivatedPositions",
	getDeactivatedPosition = "getDeactivatedPosition",
	incrementOtherSellFailureCount = "incrementOtherSellFailureCount",
	doubleSellSlippage = "doubleSellSlippage",
	setOpenPositionSellPriorityFee = "setOpenPositionSellPriorityFee"
}

export async function setOpenPositionSellPriorityFeeInTracker(positionID : string, tokenAddress : string, vsTokenAddress : string, multiplier : 'auto'|number, env : Env) : Promise<SetOpenPositionSellPriorityFeeInTrackerResponse> {
	const request : SetOpenPositionSellPriorityFeeInTrackerRequest = { positionID, tokenAddress, vsTokenAddress, multiplier };
	const method = TokenPairPositionTrackerDOFetchMethod.setOpenPositionSellPriorityFee;
	const response = await sendJSONRequestToTokenPairPositionTracker<SetOpenPositionSellPriorityFeeInTrackerRequest,SetOpenPositionSellPriorityFeeInTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
	return response;
}

export async function doubleSellSlippageInTracker(positionID : string, markAsOpen: boolean, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<DoubleSellSlippageInTrackerResponse> {
	const request : DoubleSellSlippageInTrackerRequest = { positionID, markAsOpen, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.doubleSellSlippage;
	const response = await sendJSONRequestToTokenPairPositionTracker<DoubleSellSlippageInTrackerRequest,DoubleSellSlippageInTrackerResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response;
}

export async function incrementOtherSellFailureCountInTracker(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<IncrementOtherSellFailureCountInTrackerResponse> {
	const request : IncrementOtherSellFailureCountInTrackerRequest = { positionID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.incrementOtherSellFailureCount;
	const response = await sendJSONRequestToTokenPairPositionTracker<IncrementOtherSellFailureCountInTrackerRequest,IncrementOtherSellFailureCountInTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
	return response;
}

export async function getDeactivatedPositionFromTracker(telegramUserID : number, positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<GetDeactivatedPositionFromTrackerResponse> {
	const request : GetDeactivatedPositionFromTrackerRequest = { telegramUserID, positionID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.getDeactivatedPosition;
	return await sendJSONRequestToTokenPairPositionTracker<GetDeactivatedPositionFromTrackerRequest,GetDeactivatedPositionFromTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
}

export async function deactivatePositionInTracker(positionID : string, tokenAddress : string, vsTokenAddress : string, markOpenBeforeDeactivating : boolean, env : Env) : Promise<DeactivatePositionInTrackerResponse> {
	const request : DeactivatePositionInTrackerRequest = { positionID, tokenAddress, vsTokenAddress, markOpenBeforeDeactivating };
	const method = TokenPairPositionTrackerDOFetchMethod.deactivatePosition;
	return await sendJSONRequestToTokenPairPositionTracker<DeactivatePositionInTrackerRequest,DeactivatePositionInTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
}

export async function reactivatePositionInTracker(userID : number, positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<ReactivatePositionInTrackerResponse> {
	const request : ReactivatePositionInTrackerRequest = { userID, positionID, tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.reactivatePosition;
	return await sendJSONRequestToTokenPairPositionTracker<ReactivatePositionInTrackerRequest,ReactivatePositionInTrackerResponse>(method,request,tokenAddress,vsTokenAddress,env);
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

export async function setSellSlippagePercentOnOpenPositionInTracker(positionID : string, tokenAddress : string, vsTokenAddress : string, sellSlippagePercent : number, env : Env) : Promise<SellSellSlippagePercentageOnOpenPositionResponse> {
	const request : SetSellSlippagePercentOnOpenPositionTrackerRequest = { positionID, tokenAddress, vsTokenAddress, sellSlippagePercent };
	const method = TokenPairPositionTrackerDOFetchMethod.setSellSlippagePercentOnOpenPosition;
	const response = await sendJSONRequestToTokenPairPositionTracker<SetSellSlippagePercentOnOpenPositionTrackerRequest,SellSellSlippagePercentageOnOpenPositionResponse>(method,request,tokenAddress,vsTokenAddress,env);
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

export async function adminInvokeAlarm(tokenAddress : string, vsTokenAddress : string, env : Env) {
	const request : HasPairAddresses = { tokenAddress, vsTokenAddress };
	const method = TokenPairPositionTrackerDOFetchMethod.adminInvokeAlarm;
	return await sendJSONRequestToTokenPairPositionTracker<HasPairAddresses,{}>(method,request,tokenAddress,vsTokenAddress,env);
}

export async function _devOnlyFeatureUpdatePrice(telegramUserID : number, tokenAddress : string, vsTokenAddress : string, price : DecimalizedAmount, env : Env) {
	if (!isTheSuperAdminUserID(telegramUserID,env)) {
		throw new Error("Cannot do that if not the super admin");
	}
	if (env.ENVIRONMENT !== 'dev') {
		throw new Error("Cannot do that if environment is not 'dev'");
	}
	const request : UpdatePriceRequest = { tokenAddress, vsTokenAddress, price };
	const method = TokenPairPositionTrackerDOFetchMethod.updatePrice;
	const response = await sendJSONRequestToTokenPairPositionTracker<UpdatePriceRequest,UpdatePriceResponse>(method,request,tokenAddress,vsTokenAddress,env);
	return response;
}


export async function editTriggerPercentOnOpenPositionInTracker(positionID : string, tokenAddress : string, vsTokenAddress : string, percent : number, env : Env) : Promise<EditTriggerPercentOnOpenPositionResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.editTriggerPercentOnOpenPosition;
	const request : EditTriggerPercentOnOpenPositionInTrackerRequest = { positionID, tokenAddress, vsTokenAddress, percent };
	const response = await sendJSONRequestToTokenPairPositionTracker<EditTriggerPercentOnOpenPositionInTrackerRequest,EditTriggerPercentOnOpenPositionResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response;
}

export async function setSellAutoDoubleOnOpenPositionInPositionTracker(positionID : string, tokenAddress : string, vsTokenAddress : string, choice : boolean, env : Env) : Promise<SetSellAutoDoubleOnOpenPositionResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.setSellAutoDoubleOnOpenPosition;
	const request : SetSellAutoDoubleOnOpenPositionInTrackerRequest =  { positionID, tokenAddress, vsTokenAddress, choice };
	const response = await sendJSONRequestToTokenPairPositionTracker<SetSellAutoDoubleOnOpenPositionInTrackerRequest,SetSellAutoDoubleOnOpenPositionResponse>(method, request, tokenAddress, vsTokenAddress, env);
	return response;
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

export async function insertPosition(position : Position, env : Env) : Promise<InsertPositionResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.insertPosition;
	const tokenAddress = position.token.address;
	const vsTokenAddress = position.vsToken.address;
	const request : InsertPositionRequest = { position, tokenAddress, vsTokenAddress };
	return await sendJSONRequestToTokenPairPositionTracker<InsertPositionRequest,InsertPositionResponse>(method,request,tokenAddress,vsTokenAddress,env);
}

export async function updatePosition(position : Position, env : Env) : Promise<UpdatePositionResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.updatePosition;
	const tokenAddress = position.token.address;
	const vsTokenAddress = position.vsToken.address;
	const request : UpdatePositionRequest = { position, tokenAddress, vsTokenAddress };
	return await sendJSONRequestToTokenPairPositionTracker<UpdatePositionRequest,UpdatePositionResponse>(method, request, tokenAddress, vsTokenAddress, env);
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

/* This should be called on cold-start */
export async function wakeUpTokenPairPositionTracker(tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<WakeupTokenPairPositionTrackerResponse> {
	const body = { 
		tokenAddress: tokenAddress, 
		vsTokenAddress : vsTokenAddress 
	};
	const response = await sendJSONRequestToTokenPairPositionTracker<WakeupTokenPairPositionTrackerRequest,WakeupTokenPairPositionTrackerResponse>(
		TokenPairPositionTrackerDOFetchMethod.wakeUp, 
		body, 
		tokenAddress, 
		vsTokenAddress, 
		env);
	return response;
}

export async function markAsClosed(positionID : string, tokenAddress : string, vsTokenAddress : string, netPNL: DecimalizedAmount, env : Env) : Promise<MarkPositionAsClosedResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.markPositionAsClosed;
	const request : MarkPositionAsClosedRequest = { positionID, tokenAddress, vsTokenAddress, netPNL };
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

export async function markBuyAsConfirmed(positionID : string, tokenAddress : string, vsTokenAddress : string, env : Env) : Promise<MarkBuyAsConfirmedResponse> {
	const method = TokenPairPositionTrackerDOFetchMethod.markBuyAsConfirmed;
	const request : MarkBuyAsConfirmedRequest = { positionID, tokenAddress, vsTokenAddress };
	const response = await sendJSONRequestToTokenPairPositionTracker<MarkBuyAsConfirmedRequest,MarkBuyAsConfirmedResponse>(method,request,tokenAddress,vsTokenAddress,env);
	return response;
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
