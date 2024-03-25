import { Structural } from "../../../util";
import { BaseUserAction } from "./base_user_action";

export interface StoreSessionValuesRequest  extends BaseUserAction {
	messageID: number
	sessionValues : Record<string,Structural>
};

export interface StoreSessionValuesResponse {
};