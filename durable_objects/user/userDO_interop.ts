import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { Position } from "../../positions";
import { TokenInfo } from "../../tokens";
import { Structural, groupIntoBatches, groupIntoMap, makeJSONRequest, makeRequest } from "../../util";
import { PositionAndMaybePNL } from "../token_pair_position_tracker/model/position_and_PNL";
import { AdminDeleteAllPositionsRequest, AdminDeleteAllPositionsResponse } from "./actions/admin_delete_all_positions";
import { AdminDeleteClosedPositionsRequest, AdminDeleteClosedPositionsResponse } from "./actions/admin_delete_closed_positions";
import { AdminResetDefaultPositionRequest, AdminResetDefaultPositionResponse } from "./actions/admin_reset_default_position_request";
import { AutomaticallyClosePositionsRequest, AutomaticallyClosePositionsResponse } from "./actions/automatically_close_positions";
import { DeleteSessionRequest } from "./actions/delete_session";
import { EditTriggerPercentOnOpenPositionRequest, EditTriggerPercentOnOpenPositionResponse } from "./actions/edit_trigger_percent_on_open_position";
import { GetClosedPositionsAndPNLSummaryRequest, GetClosedPositionsAndPNLSummaryResponse } from "./actions/get_closed_positions_and_pnl_summary";
import { GetImpersonatedUserIDRequest, GetImpersonatedUserIDResponse } from "./actions/get_impersonated_user_id";
import { GetLegalAgreementStatusRequest, GetLegalAgreementStatusResponse } from "./actions/get_legal_agreement_status";
import { GetPositionFromUserDORequest, GetPositionFromUserDOResponse } from "./actions/get_position_from_user_do";
import { GetSessionValuesRequest, GetSessionValuesWithPrefixRequest, GetSessionValuesWithPrefixResponse, SessionValuesResponse } from "./actions/get_session_values";
import { GetUserDataRequest } from "./actions/get_user_data";
import { GetUserWalletSOLBalanceRequest, GetUserWalletSOLBalanceResponse } from "./actions/get_user_wallet_balance";
import { GetWalletDataRequest, GetWalletDataResponse } from "./actions/get_wallet_data";
import { ImpersonateUserRequest, ImpersonateUserResponse } from "./actions/impersonate_user";
import { ListPositionsFromUserDORequest, ListPositionsFromUserDOResponse } from "./actions/list_positions_from_user_do";
import { ManuallyClosePositionRequest, ManuallyClosePositionResponse } from "./actions/manually_close_position";
import { OpenPositionRequest, OpenPositionResponse } from "./actions/open_new_position";
import { DefaultTrailingStopLossRequestRequest, DefaultTrailingStopLossRequestResponse } from "./actions/request_default_position_request";
import { SendMessageToUserRequest, SendMessageToUserResponse } from "./actions/send_message_to_user";
import { SetSellAutoDoubleOnOpenPositionRequest, SetSellAutoDoubleOnOpenPositionResponse } from "./actions/set_sell_auto_double_on_open_position";
import { SellSellSlippagePercentageOnOpenPositionRequest, SellSellSlippagePercentageOnOpenPositionResponse } from "./actions/set_sell_slippage_percent_on_open_position";
import { StoreLegalAgreementStatusRequest, StoreLegalAgreementStatusResponse } from "./actions/store_legal_agreement_status";
import { StoreSessionValuesRequest, StoreSessionValuesResponse } from "./actions/store_session_values";
import { UnimpersonateUserRequest, UnimpersonateUserResponse } from "./actions/unimpersonate_user";
import { SessionKey } from "./model/session";
import { UserData } from "./model/user_data";

export enum UserDOFetchMethod {
	get = "get",
	storeSessionValues = "storeSessionValues",
	getSessionValues = "getSessionValues",
	getSessionValuesWithPrefix = "getSessionValuesWithPrefix",
	deleteSession = "deleteSession",
	getWalletData = "getWalletData",
	openNewPosition = "openNewPosition",
	manuallyClosePosition = "manuallyClosePosition", // user initiated close position
	automaticallyClosePositions = "automaticallyClosePositions", // system-initiated close position
	getDefaultTrailingStopLossRequest = "getDefaultTrailingStopLossRequest",
	storeLegalAgreementStatus = "storeLegalAgreementStatus",
	getLegalAgreementStatus = "getLegalAgreementStatus",
	getImpersonatedUserID = "getImpersonatedUserID",
	impersonateUser = "impersonateUser",
	unimpersonateUser = "unimpersonateUser",
	listPositionsFromUserDO = "listPositionsFromUserDO",
	getPositionFromUserDO = "getPositionFromUserDO",
	sendMessageToUser = "sendMessageToUser",
	editTriggerPercentOnOpenPosition = "editTriggerPercentOnOpenPosition",
	setSellAutoDoubleOnOpenPositionRequest = "setSellAutoDoubleOnOpenPositionRequest",
	adminDeleteAllPositions = "adminDeleteAllPositions",
	setSellSlippagePercentOnOpenPosition = "setSellSlippagePercentOnOpenPosition",
	getUserWalletSOLBalance = "getUserSOLBalance",
	getClosedPositionsAndPNLSummary = "getClosedPositionsAndPNLSummary",
	adminDeleteClosedPositions = "adminDeleteClosedPositions",
	adminResetDefaultPositionRequest = "adminResetDefaultPositionRequest"
}

export async function adminDeleteClosedPositions(telegramUserID : number, chatID : number, env : Env) : Promise<AdminDeleteClosedPositionsResponse> {
	const request : AdminDeleteClosedPositionsRequest = { telegramUserID, chatID };
	const method = UserDOFetchMethod.adminDeleteClosedPositions;
	const response = await sendJSONRequestToUserDO<AdminDeleteClosedPositionsRequest,AdminDeleteClosedPositionsResponse>(telegramUserID, method, request, env);
	return response;
}

export async function adminResetDefaultPositionRequest(telegramUserID : number, chatID : number, env : Env) : Promise<AdminResetDefaultPositionResponse> {
	const request: AdminResetDefaultPositionRequest = { telegramUserID, chatID };
	const method = UserDOFetchMethod.adminResetDefaultPositionRequest;
	const response = await sendJSONRequestToUserDO<AdminResetDefaultPositionRequest,AdminResetDefaultPositionResponse>(telegramUserID, method, request, env);
	return response;
}

export async function getClosedPositionsAndPNLSummary(telegramUserID : number, chatID : number, env : Env) : Promise<GetClosedPositionsAndPNLSummaryResponse> {
	const request : GetClosedPositionsAndPNLSummaryRequest = { telegramUserID, chatID };
	const method = UserDOFetchMethod.getClosedPositionsAndPNLSummary;
	const response = await sendJSONRequestToUserDO<GetClosedPositionsAndPNLSummaryRequest,GetClosedPositionsAndPNLSummaryResponse>(telegramUserID, method, request, env);
	return response;
}

export async function getUserWalletSOLBalance(telegramUserID : number, chatID : number, env : Env) : Promise<DecimalizedAmount|null> {
	const request : GetUserWalletSOLBalanceRequest = { telegramUserID, chatID };
	const method = UserDOFetchMethod.getUserWalletSOLBalance;
	const response = await sendJSONRequestToUserDO<GetUserWalletSOLBalanceRequest,GetUserWalletSOLBalanceResponse>(telegramUserID, method, request, env);
	return response.maybeSOLBalance;
}

export async function setSellSlippagePercentOnOpenPosition(telegramUserID : number, chatID : number, positionID : string, sellSlippagePercent : number, env : Env) : Promise<SellSellSlippagePercentageOnOpenPositionResponse> {
	const request : SellSellSlippagePercentageOnOpenPositionRequest = { telegramUserID, chatID, positionID, sellSlippagePercent };
	const method = UserDOFetchMethod.setSellSlippagePercentOnOpenPosition;
	const response = await sendJSONRequestToUserDO<SellSellSlippagePercentageOnOpenPositionRequest,SellSellSlippagePercentageOnOpenPositionResponse>(telegramUserID, method, request, env);
	return response;
}

export async function sendMessageToUser(toTelegramUserID : number, fromTelegramUserName : string, fromTelegramUserID: number, message : string, env : Env) : Promise<SendMessageToUserResponse> {
	const request : SendMessageToUserRequest = { toTelegramUserID, fromTelegramUserName, fromTelegramUserID, message };
	const method = UserDOFetchMethod.sendMessageToUser;
	const response = await sendJSONRequestToUserDO<SendMessageToUserRequest,SendMessageToUserResponse>(toTelegramUserID, method, request, env);
	return response;
}

export async function listPositionsFromUserDO(telegramUserID : number, chatID : number, env : Env) : Promise<PositionAndMaybePNL[]> {
	const request : ListPositionsFromUserDORequest = { telegramUserID, chatID };
	const method = UserDOFetchMethod.listPositionsFromUserDO;
	const response = await sendJSONRequestToUserDO<ListPositionsFromUserDORequest,ListPositionsFromUserDOResponse>(telegramUserID, method, request, env);
	return response.positions;
}

export async function editTriggerPercentOnOpenPositionFromUserDO(telegramUserID : number, chatID : number, positionID : string, percent : number, env : Env) : Promise<EditTriggerPercentOnOpenPositionResponse> {
	const request : EditTriggerPercentOnOpenPositionRequest = { telegramUserID, chatID, positionID, percent };
	const method = UserDOFetchMethod.editTriggerPercentOnOpenPosition;
	const response = await sendJSONRequestToUserDO<EditTriggerPercentOnOpenPositionRequest,EditTriggerPercentOnOpenPositionResponse>(telegramUserID, method, request, env);
	return response;
}

export async function getPositionFromUserDO(telegramUserID : number, chatID : number, positionID : string, env : Env) : Promise<PositionAndMaybePNL|undefined> {
	const request : GetPositionFromUserDORequest = { telegramUserID, chatID, positionID };
	const method = UserDOFetchMethod.getPositionFromUserDO;
	const response = await sendJSONRequestToUserDO<GetPositionFromUserDORequest,GetPositionFromUserDOResponse>(telegramUserID, method, request, env);
	return response.position;
}

export async function getImpersonatedUserID(telegramUserID : number, chatID : number, env : Env) : Promise<GetImpersonatedUserIDResponse> {
	const request : GetImpersonatedUserIDRequest = { telegramUserID, chatID };
	const response = await sendJSONRequestToUserDO<GetImpersonatedUserIDRequest,GetImpersonatedUserIDResponse>(telegramUserID, UserDOFetchMethod.getImpersonatedUserID, request, env);
	return response;
}

export async function storeLegalAgreementStatus(telegramUserID : number, chatID :  number, status : 'agreed'|'refused', env : Env) : Promise<StoreLegalAgreementStatusResponse> {
	const request : StoreLegalAgreementStatusRequest = { telegramUserID, chatID, status };
	return await sendJSONRequestToUserDO<StoreLegalAgreementStatusRequest,StoreLegalAgreementStatusResponse>(telegramUserID, UserDOFetchMethod.storeLegalAgreementStatus, request, env);
}

export async function getLegalAgreementStatus(telegramUserID : number, chatID : number, env : Env) : Promise<GetLegalAgreementStatusResponse> {
	const request : GetLegalAgreementStatusRequest = { telegramUserID, chatID };
	return await sendJSONRequestToUserDO<GetLegalAgreementStatusRequest,GetLegalAgreementStatusResponse>(telegramUserID, UserDOFetchMethod.getLegalAgreementStatus, request, env);
}

export async function getWalletData(telegramUserID : number, chatID : number, env: Env) : Promise<GetWalletDataResponse> {
	const request : GetWalletDataRequest = { telegramUserID, chatID };
	return await sendJSONRequestToUserDO<GetWalletDataRequest,GetWalletDataResponse>(telegramUserID, UserDOFetchMethod.getWalletData, request, env);
}

export async function adminDeleteAllPositions(telegramUserID : number, chatID : number, realTelegramUserID : number, env : Env) : Promise<AdminDeleteAllPositionsResponse> {
	const method = UserDOFetchMethod.adminDeleteAllPositions;
	const request : AdminDeleteAllPositionsRequest = { telegramUserID, chatID, realTelegramUserID };
	return await sendJSONRequestToUserDO<AdminDeleteAllPositionsRequest,AdminDeleteAllPositionsResponse>(telegramUserID, method, request, env);
}


// care taken here not to exceed simultaneous subrequest limit
export async function sendClosePositionOrdersToUserDOs(positionsToClose: Position[], env : Env) {
	const positionsGroupedByUser = groupIntoMap(positionsToClose, (p : Position) => p.userID);
	const pairs = [...positionsGroupedByUser];
	const batchesOfUsers = groupIntoBatches(pairs,4);
	for (const userBatch of batchesOfUsers) {
		const promises = []
		// let 4 subrequests go out at once, each containing a batch of positions
		for (const [userID, group] of userBatch) {
			promises.push(tryToClosePositions(userID,group,env));
		}
		await Promise.allSettled(promises);
	}
}

export async function tryToClosePositions(userID : number, positions : Position[], env : Env) {
	const method = UserDOFetchMethod.automaticallyClosePositions;
	const chatID = positions[0].chatID;
	const individualRequestForUserDO : AutomaticallyClosePositionsRequest = { telegramUserID: userID, chatID: chatID, positions: positions };
	await sendJSONRequestToUserDO<AutomaticallyClosePositionsRequest,AutomaticallyClosePositionsResponse>(userID, method, individualRequestForUserDO, env);
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

export async function deleteSession(telegramUserID : number, chatID : number, messageID : number, env : Env) {
	const deleteSessionRequestBody : DeleteSessionRequest = { telegramUserID, chatID, messageID };
	const request = makeUserDOFetchRequest(UserDOFetchMethod.deleteSession, deleteSessionRequestBody);
	const userDO = getUserDO(telegramUserID, env);
	return await userDO.fetch(request);
}

export async function getSessionState(telegramUserID : number, chatID : number, messageID : number, sessionKeys : SessionKey[], env : Env) {
	const body : GetSessionValuesRequest = {
		telegramUserID,
		chatID,
		messageID,
		sessionKeys: sessionKeys.map(x => { return x.toString(); })	
	};
	const sessionValuesResponse = await sendJSONRequestToUserDO<GetSessionValuesRequest,SessionValuesResponse>(telegramUserID, UserDOFetchMethod.getSessionValues, body, env);
	return sessionValuesResponse.sessionValues;
}

export async function storeSessionObjProperty(telegramUserID : number, chatID : number, messageID : number, property : string, value : Structural, prefix : string, env : Env) {
	const sessionValues = new Map<SessionKey,Structural>([[property,value]]);
	return await storeSessionValues(telegramUserID, chatID, messageID, sessionValues, prefix, env);
}

export async function readSessionObj<TObj extends {[key : string] : Structural}>(telegramUserID : number, chatID : number, messageID : number, prefix : string, env : Env) : Promise<TObj> {
	const record = await readSessionValuesWithPrefix(telegramUserID, chatID, messageID, prefix, env);
	const obj = stripPrefixFromRecordKeys(record, prefix);
	return obj as TObj;
}

export async function maybeReadSessionObj<TObj extends {[key : string ] : Structural}>(telegramUserID : number, chatID: number, messageID : number, prefix : string, env : Env) : Promise<TObj|null> {
	const record = await readSessionValuesWithPrefix(telegramUserID, chatID, messageID, prefix, env);
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

async function readSessionValuesWithPrefix(telegramUserID : number, chatID : number, messageID : number, prefix : string, env : Env) : Promise<any> {
	const body : GetSessionValuesWithPrefixRequest = {
		telegramUserID,
		chatID,
		messageID,
		prefix
	};
	const response = await sendJSONRequestToUserDO<GetSessionValuesWithPrefixRequest,GetSessionValuesWithPrefixResponse>(telegramUserID, UserDOFetchMethod.getSessionValuesWithPrefix, body, env);
	return response.values;
}

export async function storeSessionObj<TObj extends {[key : string] : Structural}>(telegramUserID : number, chatID : number, messageID : number, obj : TObj, prefix : string, env : Env) : Promise<StoreSessionValuesResponse> {
	const valuesMap = new Map<string,Structural>();
	for (const key of Object.keys(obj)) {
		const propertyValue = obj[key];
		valuesMap.set(key, propertyValue);
	}
	return await storeSessionValues(telegramUserID, chatID, messageID, valuesMap, prefix, env);
}

export async function manuallyClosePosition(telegramUserID : number, chatID : number, positionID : string, env : Env) : Promise<ManuallyClosePositionResponse> {
	const body = { telegramUserID, chatID, positionID };
	const response = await sendJSONRequestToUserDO<ManuallyClosePositionRequest,ManuallyClosePositionResponse>(telegramUserID, UserDOFetchMethod.manuallyClosePosition, body, env);
	return response;
}

export async function storeSessionValues(telegramUserID : number, chatID : number, messageID : number, sessionValues : Map<string,Structural>, prefix : string, env : Env) : Promise<StoreSessionValuesResponse> {
	const sessionValuesRecord : Record<string,Structural> = {};
	for (const [sessionKey,value] of sessionValues) {
		const fullSessionKey = `${prefix}/${sessionKey}`;
		sessionValuesRecord[fullSessionKey] = value;
	}
	const body : StoreSessionValuesRequest = {
		telegramUserID,
		chatID,
		messageID,
		sessionValues: sessionValuesRecord
	};
	const response = await sendJSONRequestToUserDO<StoreSessionValuesRequest,StoreSessionValuesResponse>(telegramUserID, UserDOFetchMethod.storeSessionValues, body, env);
	return response;
}

export async function getUserData(telegramUserID : number, chatID : number, messageID : number, forceRefreshBalance : boolean, env : Env) : Promise<UserData> {
	const body : GetUserDataRequest = { telegramUserID, chatID, messageID, forceRefreshBalance };
	const response = await sendJSONRequestToUserDO<GetUserDataRequest,UserData>(telegramUserID, UserDOFetchMethod.get, body, env);
	return response;
}

export async function requestNewPosition(telegramUserID : number, positionRequestRequest : OpenPositionRequest, env : Env) : Promise<OpenPositionResponse> {
	const response = await sendJSONRequestToUserDO<OpenPositionRequest,OpenPositionResponse>(telegramUserID, UserDOFetchMethod.openNewPosition, positionRequestRequest, env);
	return response;
}

export async function impersonateUser(telegramUserID : number, chatID : number, userIDToImpersonate : number, env : Env) : Promise<void> {
	const request : ImpersonateUserRequest = { telegramUserID, chatID, userIDToImpersonate };
	await sendJSONRequestToUserDO<ImpersonateUserRequest,ImpersonateUserResponse>(telegramUserID, UserDOFetchMethod.impersonateUser, request, env);
	return;
}

export async function unimpersonateUser(telegramUserID : number, chatID : number, env : Env) : Promise<void> {
	const request : UnimpersonateUserRequest = { telegramUserID, chatID };
	await sendJSONRequestToUserDO<UnimpersonateUserRequest,UnimpersonateUserResponse>(telegramUserID, UserDOFetchMethod.unimpersonateUser, request, env);
	return;
}

export async function setSellAutoDoubleOnOpenPosition(telegramUserID : number, chatID : number, positionID : string, choice : boolean, env : Env) : Promise<SetSellAutoDoubleOnOpenPositionResponse> {
	const request : SetSellAutoDoubleOnOpenPositionRequest = { telegramUserID, chatID, positionID, choice };
	const method = UserDOFetchMethod.setSellAutoDoubleOnOpenPositionRequest;
	return await sendJSONRequestToUserDO<SetSellAutoDoubleOnOpenPositionRequest,SetSellAutoDoubleOnOpenPositionResponse>(telegramUserID, method, request, env);
}