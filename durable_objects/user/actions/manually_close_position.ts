import { BaseUserDORequest } from "./base_user_do_request";

export interface ManuallyClosePositionRequest  extends BaseUserDORequest {
	positionID : string
}

export type ManuallyClosePositionResponse = 
	{ success: null, reason: 'attempting-sale' } |
	{ success: false, reason: 'position-closed'|
		'position-closing'|
		'buy-unconfirmed'|
		'no-token-pair'|
		'position-DNE' 
	};
