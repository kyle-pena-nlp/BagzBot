import { CreateWriteStreamOptions } from "fs/promises";
import { ClosePositionsRequest, ClosePositionsResponse, CreateWalletRequest, CreateWalletResponse, DefaultTrailingStopLossRequestRequest, Env, GetPositionRequest, GetSessionValuesRequest, GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse, GetUserDataRequest, LongTrailingStopLossPositionRequest, LongTrailingStopLossPositionRequestResponse, ManuallyClosePositionRequest, ManuallyClosePositionResponse, Position, SessionKey, SessionValue, SessionValuesResponse, StoreSessionValuesRequest, StoreSessionValuesResponse, UserData, UserInitializeRequest, UserInitializeResponse } from "./common";
import { makeJSONRequest, makeRequest } from "./http_helpers";
import { UserDO } from "./user_DO";

export enum UserDOFetchMethod {
	get = "get",
	initialize = "initialize",
	storeSessionValues = "storeSessionValues",
	getSessionValues = "getSessionValues",
	getSessionValuesWithPrefix = "getSessionValuesWithPrefix",
	deleteSession = "deleteSession",
	createWallet = "createWallet",
	requestNewPosition = "requestNewPosition",
	getPosition = "getPosition",
	manuallyClosePosition = "manuallyClosePosition",
	notifyPositionFillSuccess = "notifyPositionFillSuccess",
	notifyPositionFillFailure = "notifyPositionFillFailure",
	notifyPositionAutoClosed = "notifyPositionAutoClosed",
	notifyPositionsAutoClosed = "notifyPositionsAutoClosed",
	getDefaultTrailingStopLossRequest = "getDefaultTrailingStopLossRequest"
}

export function makeUserDOFetchRequest<T>(method : UserDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://userDO/${method.toString()}`
	if (body != null) {
		return makeJSONRequest(url, body);
	}
	else {
		return makeRequest(url, httpMethod);
	}
}

async function sendJSONRequestToUserDO<TRequest,TResponse>(telegramUserID : number, method : UserDOFetchMethod, body: TRequest, env : Env) : Promise<TResponse> {
	const request = makeUserDOFetchRequest(method, body);
	const userDO = getUserDO(telegramUserID, env);
	const response = await userDO.fetch(request);
	const jsonResponse = await response.json();
	return jsonResponse as TResponse;
}

export function getUserDO(telegramUserID : number, env : Env) : any {
	const userDONamespace : DurableObjectNamespace = env.UserDO;
	const userDODurableObjectID = userDONamespace.idFromName(telegramUserID.toString());
	const userDO = userDONamespace.get(userDODurableObjectID);
	return userDO;
}


export async function getPosition(telegramUserID : number, positionID : string, env : Env) : Promise<Position> {
	const body : GetPositionRequest = { positionID : positionID };
	const position = await sendJSONRequestToUserDO<GetPositionRequest,Position>(telegramUserID, UserDOFetchMethod.getPosition, body, env);
	return position;
}

export async function getDefaultTrailingStopLoss(telegramUserID : number, token : string, tokenAddress : string, env : Env) : Promise<LongTrailingStopLossPositionRequest> {
	const body : DefaultTrailingStopLossRequestRequest = { token : token, tokenAddress : tokenAddress };
	const trailingStopLossRequest = await sendJSONRequestToUserDO<DefaultTrailingStopLossRequestRequest,LongTrailingStopLossPositionRequest>(telegramUserID, UserDOFetchMethod.getDefaultTrailingStopLossRequest, body, env);
	return trailingStopLossRequest;
}

export async function getSessionState(telegramUserID : number, messageID : number, sessionKeys : SessionKey[], env : Env) {
	const body : GetSessionValuesRequest = {
		messageID: messageID,
		sessionKeys: sessionKeys.map(x => { return x.toString()})	
	};
	const sessionValuesResponse = await sendJSONRequestToUserDO<GetSessionValuesRequest,SessionValuesResponse>(telegramUserID, UserDOFetchMethod.getSessionValues, body, env);
	return sessionValuesResponse.sessionValues;
}

export async function storeSessionObjProperty(telegramUserID : number, messageID : number, property : string, value : SessionValue, prefix : string, env : Env) {
	const sessionValues = new Map<SessionKey,SessionValue>([[property,value]]);
	return await storeSessionValues(telegramUserID, messageID, sessionValues, prefix, env);
}

export async function readSessionObj<TObj extends {[key : string] : SessionValue}>(telegramUserID : number, messageID : number, prefix : string, env : Env) : Promise<TObj> {
	const record = await readSessionValuesWithPrefix(telegramUserID, messageID, prefix, env);
	return record as TObj;
}

async function readSessionValuesWithPrefix(telegramUserID : number, messageID : number, prefix : string, env : Env) : Promise<any> {
	const body : GetSessionValuesWithPrefixRequest = {
		messageID : messageID,
		prefix: prefix
	};
	const response = await sendJSONRequestToUserDO<GetSessionValuesWithPrefixRequest,GetSessionValuesWithPrefixResponse>(telegramUserID, UserDOFetchMethod.getSessionValuesWithPrefix, body, env);
}

export async function storeSessionObj<TObj extends {[key : string] : SessionValue}>(telegramUserID : number, messageID : number, obj : TObj, prefix : string, env : Env) : Promise<StoreSessionValuesResponse> {
	const valuesMap = new Map<string,SessionValue>();
	for (const key of Object.keys(obj)) {
		const propertyValue = obj[key];
		valuesMap.set(key, propertyValue);
	}
	return await storeSessionValues(telegramUserID, messageID, valuesMap, prefix, env);
}

export async function manuallyClosePosition(telegramUserID : number, positionID : string, env : Env) : Promise<ManuallyClosePositionResponse> {
	const body = { positionID : positionID };
	const response = await sendJSONRequestToUserDO<ManuallyClosePositionRequest,ManuallyClosePositionResponse>(telegramUserID, UserDOFetchMethod.manuallyClosePosition, body, env);
	return response;
}

export async function storeSessionValues(telegramUserID : number, messageID : number, sessionValues : Map<string,SessionValue>, prefix : string, env : Env) {
	const sessionValuesRecord : Record<string,SessionValue> = {};
	for (const [sessionKey,value] of sessionValues) {
		const fullSessionKey = `${prefix}:${sessionKey}`;
		sessionValuesRecord[fullSessionKey] = value;
	}
	const body : StoreSessionValuesRequest = {
		messageID: messageID,
		sessionValues: sessionValuesRecord
	};
	const response = sendJSONRequestToUserDO<StoreSessionValuesRequest,StoreSessionValuesResponse>(telegramUserID, UserDOFetchMethod.storeSessionValues, body, env);
	return response;
}

export async function getAndMaybeInitializeUserData(telegramUserID : number, telegramUserName : string, messageID : number, env : Env) : Promise<UserData> {
	const userData = await getUserData(telegramUserID, messageID, env);
	if (userData.initialized) {
		return userData;
	}
	return await initializeAndReturnUserData(telegramUserID, messageID, telegramUserName, env);
}

export async function initializeAndReturnUserData(telegramUserID : number, messageID : number, telegramUserName : string, env : Env) : Promise<UserData> {		
	await initializeUserData(telegramUserID, telegramUserName, env);
	return await getUserData(telegramUserID, messageID, env);
}

async function getUserData(telegramUserID : number, messageID : number, env : Env) : Promise<UserData> {
	const body : GetUserDataRequest = { messageID : messageID };
	const response = await sendJSONRequestToUserDO<GetUserDataRequest,UserData>(telegramUserID, UserDOFetchMethod.get, body, env);
	return response;
}

async function initializeUserData(telegramUserID : number, telegramUserName : string, env : Env) : Promise<UserInitializeResponse> {
	const body : UserInitializeRequest = { telegramUserID : telegramUserID, telegramUserName: telegramUserName };
	const response = await sendJSONRequestToUserDO<UserInitializeRequest,UserInitializeResponse>(telegramUserID, UserDOFetchMethod.initialize, body, env);
	return response;
}

export async function createWallet(telegramUserID : number, env : Env) : Promise<CreateWalletResponse> {
	const body: CreateWalletRequest = {};
	const response = await sendJSONRequestToUserDO<CreateWalletRequest,CreateWalletResponse>(telegramUserID, UserDOFetchMethod.createWallet, body, env);
	return response;
}

export async function requestNewPosition(telegramUserID : number, positionRequest : LongTrailingStopLossPositionRequest, env : Env) : Promise<LongTrailingStopLossPositionRequestResponse> {
	const response = await sendJSONRequestToUserDO<LongTrailingStopLossPositionRequest,LongTrailingStopLossPositionRequestResponse>(telegramUserID, UserDOFetchMethod.requestNewPosition, positionRequest, env);
	return response;
}

/*
// TODO
export async function setSessionTrailingStopLossRequestProperty(telegramUserID : number, messageID : number, property : string, value : SessionValue, env : Env) {
	const response = setSessionObjPropertyAndReturnSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, property, value, "LongTrailingStopLossPositionRequest", env);
	
}
*/