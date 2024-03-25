import { BaseUserDORequest } from "./base_user_action";

export interface ManuallyClosePositionRequest  extends BaseUserDORequest {
	positionID : string
}

export interface ManuallyClosePositionResponse {
	message: string
}
