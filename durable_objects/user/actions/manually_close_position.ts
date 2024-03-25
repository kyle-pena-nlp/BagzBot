import { BaseUserAction } from "./base_user_action";

export interface ManuallyClosePositionRequest  extends BaseUserAction {
	positionID : string
}

export interface ManuallyClosePositionResponse {
	message: string
}
