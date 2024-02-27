import { makeJSONRequest, makeRequest } from "./http_helpers";

export enum UserDOFetchMethod {
	get = "get",
	initialize = "initialize",
	storeSessionValues = "storeSessionValues",
	getSessionValues = "getSessionValues",
	deleteSession = "deleteSession",
	generateWallet = "generateWallet",
	requestNewPosition = "requestNewPosition",
	getPosition = "getPosition",
	manuallyClosePosition = "manuallyClosePosition",
	notifyPositionFillSuccess = "notifyPositionFillSuccess",
	notifyPositionFillFailure = "notifyPositionFillFailure",
	notifyPositionAutoClosed = "notifyPositionAutoClosed",
	notifyPositionsAutoClosed = "notifyPositionsAutoClosed"
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