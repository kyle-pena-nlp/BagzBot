import { Structural } from "../../../util/structural";

export interface StoreSessionValuesRequest {
	messageID: number
	sessionValues : Record<string,Structural>
};

export interface StoreSessionValuesResponse {
};