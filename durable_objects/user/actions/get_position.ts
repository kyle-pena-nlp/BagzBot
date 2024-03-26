import { BaseUserDORequest } from "./base_user_do_request";

export interface GetPositionRequest  extends BaseUserDORequest {
	positionID : string
};