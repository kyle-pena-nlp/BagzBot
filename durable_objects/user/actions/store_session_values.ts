import { SessionValue } from "../model/session"

export interface StoreSessionValuesRequest {
	messageID: number
	sessionValues : Record<string,SessionValue>
};

export interface StoreSessionValuesResponse {
};