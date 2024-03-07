import { SessionValue } from "../model/session"

export interface GetSessionValuesRequest {
	messageID : number
	sessionKeys : string[]
}

export interface SessionValuesResponse {
	sessionValues : Record<string,SessionValue>
}


export interface GetSessionValuesWithPrefixRequest {
	messageID : number
	prefix : string
};

export interface GetSessionValuesWithPrefixResponse {
	values : Record<string,SessionValue>
};
