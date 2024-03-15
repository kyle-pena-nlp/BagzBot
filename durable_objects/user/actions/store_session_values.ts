import { Structural } from "../../../util";

export interface StoreSessionValuesRequest {
	messageID: number
	sessionValues : Record<string,Structural>
};

export interface StoreSessionValuesResponse {
};