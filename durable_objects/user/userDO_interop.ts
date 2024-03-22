import { Env } from "../../env";
import { Position } from "../../positions";
import { TokenInfo } from "../../tokens";
import { Structural, groupIntoMap, makeJSONRequest, makeRequest } from "../../util";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "../token_pair_position_tracker/actions/automatically_close_positions";
import { DeleteSessionRequest } from "./actions/delete_session";
import { GenerateWalletRequest, GenerateWalletResponse } from "./actions/generate_wallet";
import { GetAddressBookEntryRequest, GetAddressBookEntryResponse } from "./actions/get_address_book_entry";
import { GetPositionRequest } from "./actions/get_position";
import { GetSessionValuesRequest, GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse, SessionValuesResponse } from "./actions/get_session_values";
import { GetUserDataRequest } from "./actions/get_user_data";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { ListAddressBookEntriesRequest, ListAddressBookEntriesResponse } from "./actions/list_address_book_entries";
import { ListPositionsRequest } from "./actions/list_positions";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { RemoveAddressBookEntryRequest, RemoveAddressBookEntryResponse } from "./actions/remove_address_book_entry";
import { DefaultTrailingStopLossRequestRequest, DefaultTrailingStopLossRequestResponse } from "./actions/request_default_position_request";
import { StoreAddressBookEntryRequest, StoreAddressBookEntryResponse } from "./actions/store_address_book_entry";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { UserInitializeRequest, UserInitializeResponse } from "./actions/user_initialize";
import { CompletedAddressBookEntry } from "./model/address_book_entry";
import { SessionKey } from "./model/session";
import { UserData } from "./model/user_data";

export enum UserDOFetchMethod {
	get = "get",
	initialize = "initialize",
	storeSessionValues = "storeSessionValues",
	getSessionValues = "getSessionValues",
	getSessionValuesWithPrefix = "getSessionValuesWithPrefix",
	deleteSession = "deleteSession",
	createWallet = "createWallet",
	getWalletData = "getWalletData",
	openNewPosition = "openNewPosition",
	getPosition = "getPosition",
	listPositions = "listPositions",
	manuallyClosePosition = "manuallyClosePosition", // user initiated close position
	automaticallyClosePositions = "automaticallyClosePositions", // system-initiated close position
	getDefaultTrailingStopLossRequest = "getDefaultTrailingStopLossRequest",
	storeAddressBookEntry = "storeAddressBookEntry",
	listAddressBookEntries = "listAddressBookEntries",
	removeAddressBookEntry = "removeAddressBookEntry",
	getAddressBookEntry = "getAddressBookEntry"
}

export async function storeAddressBookEntry(userID : number, addressBookEntry : CompletedAddressBookEntry, env : Env) {
	const storeAddressBookEntryRequest : StoreAddressBookEntryRequest = { addressBookEntry : addressBookEntry };
	return await sendJSONRequestToUserDO<StoreAddressBookEntryRequest,StoreAddressBookEntryResponse>(userID, UserDOFetchMethod.storeAddressBookEntry, storeAddressBookEntryRequest, env);
}

export async function listAddressBookEntries(userID : number, env : Env) {
	const request : ListAddressBookEntriesRequest = {};
	return await sendJSONRequestToUserDO<ListAddressBookEntriesRequest,ListAddressBookEntriesResponse>(userID, UserDOFetchMethod.listAddressBookEntries, request, env);
}

export async function getAddressBookEntry(userID : number, addressBookEntryId : string, env : Env) : Promise<CompletedAddressBookEntry|undefined> {
	const request : GetAddressBookEntryRequest = { addressBookEntryID: addressBookEntryId };
	const response = await sendJSONRequestToUserDO<GetAddressBookEntryRequest,GetAddressBookEntryResponse>(userID, UserDOFetchMethod.getAddressBookEntry, request, env);
	return response.addressBookEntry;
}

export async function removeAddressBookEntry(userID : number, addressBookEntryId : string, env : Env) : Promise<void> {
	const request : RemoveAddressBookEntryRequest = { addressBookEntryID: addressBookEntryId };
	const response = await sendJSONRequestToUserDO<RemoveAddressBookEntryRequest,RemoveAddressBookEntryResponse>(userID, UserDOFetchMethod.removeAddressBookEntry, request, env);
	return;
}

export async function getWalletData(userID : number, env: Env) : Promise<GetWalletDataResponse> {
	const request : GetWalletDataRequest = { telegramUserID: userID };
	return await sendJSONRequestToUserDO<GetWalletDataRequest,GetWalletDataResponse>(userID, UserDOFetchMethod.getWalletData, request, env);
}

export function sendClosePositionOrdersToUserDOs(request: AutomaticallyClosePositionsRequest, env : Env) {
	const positionsGroupedByUser = groupIntoMap(request.positions, (p : Position) => p.userID);
	const promises = [];
	const method = UserDOFetchMethod.automaticallyClosePositions;
	for (const userID of positionsGroupedByUser.keys()) {
		const positions = positionsGroupedByUser.get(userID)||[];
		const individualRequestForUserDO : AutomaticallyClosePositionsRequest = { positions: positions };
		const promise = sendJSONRequestToUserDO<AutomaticallyClosePositionsRequest,AutomaticallyClosePositionsResponse>(userID, method, individualRequestForUserDO, env);
		promises.push(promise);
	}
	return Promise.allSettled(promises);
}

export function parseUserDOFetchMethod(value : string) : UserDOFetchMethod|null {
	return Object.values(UserDOFetchMethod).find(x => x === value)||null;
}

export function makeUserDOFetchRequest<T>(method : UserDOFetchMethod, body?: T, httpMethod? : 'GET'|'POST') : Request {
	const url = `http://userDO/${method.toString()}`;
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

export async function listOpenTrailingStopLossPositions(telegramUserID : number, env : Env) : Promise<Position[]> {
	const body  : ListPositionsRequest = {};
	const positions = await sendJSONRequestToUserDO<ListPositionsRequest,Position[]>(telegramUserID, UserDOFetchMethod.listPositions, body, env);
	return positions;
}

export async function getPosition(telegramUserID : number, positionID : string, env : Env) : Promise<Position> {
	const body : GetPositionRequest = { positionID : positionID };
	const position = await sendJSONRequestToUserDO<GetPositionRequest,Position>(telegramUserID, UserDOFetchMethod.getPosition, body, env);
	return position;
}

export async function getDefaultTrailingStopLoss(telegramUserID : number, 
	chatID : number, 
	messageID :  number,
	token : TokenInfo, 
	env : Env) : Promise<DefaultTrailingStopLossRequestResponse> {
	const body : DefaultTrailingStopLossRequestRequest = { 
		userID: telegramUserID, 
		chatID: chatID, 
		messageID : messageID,
		token : token };
	const trailingStopLossRequest = await sendJSONRequestToUserDO<DefaultTrailingStopLossRequestRequest,DefaultTrailingStopLossRequestResponse>(telegramUserID, UserDOFetchMethod.getDefaultTrailingStopLossRequest, body, env);
	return trailingStopLossRequest;
}

export async function deleteSession(telegramUserID : number, messageID : number, env : Env) {
	const deleteSessionRequestBody : DeleteSessionRequest = { messageID: messageID };
	const request = makeUserDOFetchRequest(UserDOFetchMethod.deleteSession, deleteSessionRequestBody);
	const userDO = getUserDO(telegramUserID, env);
	return await userDO.fetch(request);
}

export async function getSessionState(telegramUserID : number, messageID : number, sessionKeys : SessionKey[], env : Env) {
	const body : GetSessionValuesRequest = {
		messageID: messageID,
		sessionKeys: sessionKeys.map(x => { return x.toString(); })	
	};
	const sessionValuesResponse = await sendJSONRequestToUserDO<GetSessionValuesRequest,SessionValuesResponse>(telegramUserID, UserDOFetchMethod.getSessionValues, body, env);
	return sessionValuesResponse.sessionValues;
}

export async function storeSessionObjProperty(telegramUserID : number, messageID : number, property : string, value : Structural, prefix : string, env : Env) {
	const sessionValues = new Map<SessionKey,Structural>([[property,value]]);
	return await storeSessionValues(telegramUserID, messageID, sessionValues, prefix, env);
}

export async function readSessionObj<TObj extends {[key : string] : Structural}>(telegramUserID : number, messageID : number, prefix : string, env : Env) : Promise<TObj> {
	const record = await readSessionValuesWithPrefix(telegramUserID, messageID, prefix, env);
	const obj = stripPrefixFromRecordKeys(record, prefix);
	return obj as TObj;
}

function stripPrefixFromRecordKeys<TObj extends {[key : string] : Structural}>(record : Record<string,Structural>, prefix : string) : TObj {
	const replacePattern = new RegExp(`^${prefix}/`);
	const obj : {[key:string]:Structural} = {};
	for (const key of Object.keys(record)) {
		const prefixFreeKey = key.replace(replacePattern, "");
		obj[prefixFreeKey] = record[key] as Structural;
	}
	return obj as TObj;
}

async function readSessionValuesWithPrefix(telegramUserID : number, messageID : number, prefix : string, env : Env) : Promise<any> {
	const body : GetSessionValuesWithPrefixRequest = {
		messageID : messageID,
		prefix: prefix
	};
	const response = await sendJSONRequestToUserDO<GetSessionValuesWithPrefixRequest,GetSessionValuesWithPrefixResponse>(telegramUserID, UserDOFetchMethod.getSessionValuesWithPrefix, body, env);
	return response.values;
}

export async function storeSessionObj<TObj extends {[key : string] : Structural}>(telegramUserID : number, messageID : number, obj : TObj, prefix : string, env : Env) : Promise<StoreSessionValuesResponse> {
	const valuesMap = new Map<string,Structural>();
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

export async function storeSessionValues(telegramUserID : number, messageID : number, sessionValues : Map<string,Structural>, prefix : string, env : Env) : Promise<StoreSessionValuesResponse> {
	const sessionValuesRecord : Record<string,Structural> = {};
	for (const [sessionKey,value] of sessionValues) {
		const fullSessionKey = `${prefix}/${sessionKey}`;
		sessionValuesRecord[fullSessionKey] = value;
	}
	const body : StoreSessionValuesRequest = {
		messageID: messageID,
		sessionValues: sessionValuesRecord
	};
	const response = await sendJSONRequestToUserDO<StoreSessionValuesRequest,StoreSessionValuesResponse>(telegramUserID, UserDOFetchMethod.storeSessionValues, body, env);
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

export async function generateWallet(telegramUserID : number, env : Env) : Promise<GenerateWalletResponse> {
	const body: GenerateWalletRequest = {};
	const response = await sendJSONRequestToUserDO<GenerateWalletRequest,GenerateWalletResponse>(telegramUserID, UserDOFetchMethod.createWallet, body, env);
	return response;
}

export async function requestNewPosition(telegramUserID : number, positionRequestRequest : OpenPositionRequest, env : Env) : Promise<OpenPositionResponse> {
	const response = await sendJSONRequestToUserDO<OpenPositionRequest,OpenPositionResponse>(telegramUserID, UserDOFetchMethod.openNewPosition, positionRequestRequest, env);
	return response;
}