import { Structural } from "../../../util/structural";

export interface GetSessionValuesRequest {
	messageID : number
	sessionKeys : string[]
}

export interface SessionValuesResponse {
	sessionValues : Record<string,Structural>
}


export interface GetSessionValuesWithPrefixRequest {
	messageID : number
	prefix : string
};

export interface GetSessionValuesWithPrefixResponse {
	values : Record<string,Structural>
};
