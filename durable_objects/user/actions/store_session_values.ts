import { Structural } from "../../../util";
import { BaseUserDORequest } from "./base_user_action";

export interface StoreSessionValuesRequest  extends BaseUserDORequest {
	messageID: number
	sessionValues : Record<string,Structural>
};

export interface StoreSessionValuesResponse {
};