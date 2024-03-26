import { Structural } from "../../../util";
import { BaseUserDORequest } from "./base_user_do_request";

export interface StoreSessionValuesRequest  extends BaseUserDORequest {
	messageID: number
	sessionValues : Record<string,Structural>
};

export interface StoreSessionValuesResponse {
};