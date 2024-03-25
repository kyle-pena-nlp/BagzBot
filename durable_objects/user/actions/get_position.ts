import { BaseUserDORequest } from "./base_user_action";

export interface GetPositionRequest  extends BaseUserDORequest {
	positionID : string
};