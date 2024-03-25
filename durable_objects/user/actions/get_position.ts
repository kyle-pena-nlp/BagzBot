import { BaseUserAction } from "./base_user_action";

export interface GetPositionRequest  extends BaseUserAction {
	positionID : string
};