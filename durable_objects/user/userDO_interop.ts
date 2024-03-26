import { Env } from "../../env";
import { Position } from "../../positions";
import { TokenInfo } from "../../tokens";
import { Structural, groupIntoMap, makeJSONRequest, makeRequest } from "../../util";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "../token_pair_position_tracker/actions/automatically_close_positions";
import { DeleteSessionRequest } from "./actions/delete_session";
import { GetAddressBookEntryRequest, GetAddressBookEntryResponse } from "./actions/get_address_book_entry";
import { GetImpersonatedUserIDRequest, GetImpersonatedUserIDResponse } from "./actions/get_impersonated_user_id";
import { GetLegalAgreementStatusRequest, GetLegalAgreementStatusResponse } from "./actions/get_legal_agreement_status";
import { GetPositionRequest } from "./actions/get_position";
import { GetSessionValuesRequest, GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse, SessionValuesResponse } from "./actions/get_session_values";
import { GetUserDataRequest } from "./actions/get_user_data";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { ImpersonateUserRequest, ImpersonateUserResponse } from "./actions/impersonate_user";
import { ListAddressBookEntriesRequest, ListAddressBookEntriesResponse } from "./actions/list_address_book_entries";
import { ListPositionsRequest } from "./actions/list_positions";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { RemoveAddressBookEntryRequest, RemoveAddressBookEntryResponse } from "./actions/remove_address_book_entry";
import { DefaultTrailingStopLossRequestRequest, DefaultTrailingStopLossRequestResponse } from "./actions/request_default_position_request";
import { StoreAddressBookEntryRequest, StoreAddressBookEntryResponse } from "./actions/store_address_book_entry";
import { StoreLegalAgreementStatusRequest, StoreLegalAgreementStatusResponse } from "./actions/store_legal_agreement_status";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { UnimpersonateUserRequest, UnimpersonateUserResponse } from "./actions/unimpersonate_user";
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
	getAddressBookEntry = "getAddressBookEntry",
	storeLegalAgreementStatus = "storeLegalAgreementStatus",
	getLegalAgreementStatus = "getLegalAgreementStatus",
	getImpersonatedUserID = "getImpersonatedUserID",
	impersonateUser = "impersonateUser",
	unimpersonateUser = "unimpersonateUser"
}


export async function getImpersonatedUserID(telegramUserID : number, env : Env) : Promise<GetImpersonatedUserIDResponse> {
	const request : GetImpersonatedUserIDRequest = { telegramUserID };
	const response = await sendJSONRequestToUserDO<GetImpersonatedUserIDRequest,GetImpersonatedUserIDResponse>(telegramUserID, UserDOFetchMethod.getImpersonatedUserID, request, env);
	return response;
}

export async function storeLegalAgreementStatus(telegramUserID : number, status : 'agreed'|'refused', env : Env) : Promise<StoreLegalAgreementStatusResponse> {
	const request : StoreLegalAgreementStatusRequest = { telegramUserID, status : status };
	return await sendJSONRequestToUserDO<StoreLegalAgreementStatusRequest,StoreLegalAgreementStatusResponse>(telegramUserID, UserDOFetchMethod.storeLegalAgreementStatus, request, env);
}

export async function getLegalAgreementStatus(telegramUserID : number, env : Env) : Promise<GetLegalAgreementStatusResponse> {
	const request : GetLegalAgreementStatusRequest = { telegramUserID };
	return await sendJSONRequestToUserDO<GetLegalAgreementStatusRequest,GetLegalAgreementStatusResponse>(telegramUserID, UserDOFetchMethod.getLegalAgreementStatus, request, env);
}

export async function storeAddressBookEntry(telegramUserID : number, addressBookEntry : CompletedAddressBookEntry, env : Env) {
	const storeAddressBookEntryRequest : StoreAddressBookEntryRequest = { telegramUserID, addressBookEntry };
	return await sendJSONRequestToUserDO<StoreAddressBookEntryRequest,StoreAddressBookEntryResponse>(telegramUserID, UserDOFetchMethod.storeAddressBookEntry, storeAddressBookEntryRequest, env);
}

export async function listAddressBookEntries(telegramUserID : number, env : Env) {
	const request : ListAddressBookEntriesRequest = { telegramUserID };
	return await sendJSONRequestToUserDO<ListAddressBookEntriesRequest,ListAddressBookEntriesResponse>(telegramUserID, UserDOFetchMethod.listAddressBookEntries, request, env);
}

export async function getAddressBookEntry(telegramUserID : number, addressBookEntryID : string, env : Env) : Promise<CompletedAddressBookEntry|undefined> {
	const request : GetAddressBookEntryRequest = { telegramUserID, addressBookEntryID };
	const response = await sendJSONRequestToUserDO<GetAddressBookEntryRequest,GetAddressBookEntryResponse>(telegramUserID, UserDOFetchMethod.getAddressBookEntry, request, env);
	return response.addressBookEntry;
}

export async function removeAddressBookEntry(telegramUserID : number, addressBookEntryID : string, env : Env) : Promise<void> {
	const request : RemoveAddressBookEntryRequest = { telegramUserID, addressBookEntryID };
	const response = await sendJSONRequestToUserDO<RemoveAddressBookEntryRequest,RemoveAddressBookEntryResponse>(telegramUserID, UserDOFetchMethod.removeAddressBookEntry, request, env);
	return;
}

export async function getWalletData(telegramUserID : number, env: Env) : Promise<GetWalletDataResponse> {
	const request : GetWalletDataRequest = { telegramUserID };
	return await sendJSONRequestToUserDO<GetWalletDataRequest,GetWalletDataResponse>(telegramUserID, UserDOFetchMethod.getWalletData, request, env);
}

// TODO: batching?
export async function sendClosePositionOrdersToUserDOs(request: AutomaticallyClosePositionsRequest, env : Env) {
	const positionsGroupedByUser = groupIntoMap(request.positions, (p : Position) => p.userID);
	const promises = [];
	const method = UserDOFetchMethod.automaticallyClosePositions;
	for (const userID of positionsGroupedByUser.keys()) {
		const positions = positionsGroupedByUser.get(userID)||[];
		const individualRequestForUserDO : AutomaticallyClosePositionsRequest = { positions: positions };
		const promise = sendJSONRequestToUserDO<AutomaticallyClosePositionsRequest,AutomaticallyClosePositionsResponse>(userID, method, individualRequestForUserDO, env);
		promises.push(promise);
	}
	return await Promise.allSettled(promises);
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
	const body  : ListPositionsRequest = { telegramUserID };
	const positions = await sendJSONRequestToUserDO<ListPositionsRequest,Position[]>(telegramUserID, UserDOFetchMethod.listPositions, body, env);
	return positions;
}

export async function getPosition(telegramUserID : number, positionID : string, env : Env) : Promise<Position> {
	const body : GetPositionRequest = { telegramUserID, positionID };
	const position = await sendJSONRequestToUserDO<GetPositionRequest,Position>(telegramUserID, UserDOFetchMethod.getPosition, body, env);
	return position;
}

export async function getDefaultTrailingStopLoss(telegramUserID : number, 
	chatID : number, 
	messageID :  number, 
	env : Env,
	token ?: TokenInfo) : Promise<DefaultTrailingStopLossRequestResponse> {
	const body : DefaultTrailingStopLossRequestRequest = { 
		telegramUserID: telegramUserID, 
		chatID: chatID, 
		messageID : messageID,
		token : token };
	const trailingStopLossRequest = await sendJSONRequestToUserDO<DefaultTrailingStopLossRequestRequest,DefaultTrailingStopLossRequestResponse>(telegramUserID, UserDOFetchMethod.getDefaultTrailingStopLossRequest, body, env);
	return trailingStopLossRequest;
}

export async function deleteSession(telegramUserID : number, messageID : number, env : Env) {
	const deleteSessionRequestBody : DeleteSessionRequest = { telegramUserID, messageID };
	const request = makeUserDOFetchRequest(UserDOFetchMethod.deleteSession, deleteSessionRequestBody);
	const userDO = getUserDO(telegramUserID, env);
	return await userDO.fetch(request);
}

export async function getSessionState(telegramUserID : number, messageID : number, sessionKeys : SessionKey[], env : Env) {
	const body : GetSessionValuesRequest = {
		telegramUserID,
		messageID,
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

export async function maybeReadSessionObj<TObj extends {[key : string ] : Structural}>(telegramUserID : number, messageID : number, prefix : string, env : Env) : Promise<TObj|null> {
	const record = await readSessionValuesWithPrefix(telegramUserID, messageID, prefix, env);
	if (Object.keys(record).length == 0) {
		return null;
	}
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
		telegramUserID,
		messageID,
		prefix
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
	const body = { telegramUserID, positionID };
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
		telegramUserID,
		messageID,
		sessionValues: sessionValuesRecord
	};
	const response = await sendJSONRequestToUserDO<StoreSessionValuesRequest,StoreSessionValuesResponse>(telegramUserID, UserDOFetchMethod.storeSessionValues, body, env);
	return response;
}

export async function getUserData(telegramUserID : number, messageID : number, forceRefreshBalance : boolean, env : Env) : Promise<UserData> {
	const body : GetUserDataRequest = { telegramUserID, messageID, forceRefreshBalance };
	const response = await sendJSONRequestToUserDO<GetUserDataRequest,UserData>(telegramUserID, UserDOFetchMethod.get, body, env);
	return response;
}

export async function requestNewPosition(telegramUserID : number, positionRequestRequest : OpenPositionRequest, env : Env) : Promise<OpenPositionResponse> {
	const response = await sendJSONRequestToUserDO<OpenPositionRequest,OpenPositionResponse>(telegramUserID, UserDOFetchMethod.openNewPosition, positionRequestRequest, env);
	return response;
}

export async function impersonateUser(telegramUserID : number, userIDToImpersonate : number, env : Env) : Promise<void> {
	const request : ImpersonateUserRequest = { telegramUserID, userIDToImpersonate };
	await sendJSONRequestToUserDO<ImpersonateUserRequest,ImpersonateUserResponse>(telegramUserID, UserDOFetchMethod.impersonateUser, request, env);
	return;
}

export async function unimpersonateUser(telegramUserID : number, env : Env) : Promise<void> {
	const request : UnimpersonateUserRequest = { telegramUserID };
	await sendJSONRequestToUserDO<UnimpersonateUserRequest,UnimpersonateUserResponse>(telegramUserID, UserDOFetchMethod.unimpersonateUser, request, env);
	return;
}