import { Structural } from "../../../util";
import { BaseUserAction } from "./base_user_action";

export interface GetSessionValuesRequest   extends BaseUserAction {
	messageID : number
	sessionKeys : string[]
}

export interface SessionValuesResponse {
	sessionValues : Record<string,Structural>
}


export interface GetSessionValuesWithPrefixRequest  extends BaseUserAction {
	messageID : number
	prefix : string
};

export interface GetSessionValuesWithPrefixResponse {
	values : Record<string,Structural>
};
