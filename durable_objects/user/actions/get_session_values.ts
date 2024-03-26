import { Structural } from "../../../util";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetSessionValuesRequest   extends BaseUserDORequest {
	messageID : number
	sessionKeys : string[]
}

export interface SessionValuesResponse {
	sessionValues : Record<string,Structural>
}


export interface GetSessionValuesWithPrefixRequest  extends BaseUserDORequest {
	messageID : number
	prefix : string
};

export interface GetSessionValuesWithPrefixResponse {
	values : Record<string,Structural>
};
