import { makeJSONRequest, makeRequest } from "./http_helpers";

export enum TokenPairPositionTrackerDOFetchMethod {
	initialize  = "initialize",
	updatePrice = "updatePrice",
	manuallyClosePosition = "manuallyClosePosition",
	requestNewPosition = "requestNewPosition",
	getPositions = "getPositions"
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