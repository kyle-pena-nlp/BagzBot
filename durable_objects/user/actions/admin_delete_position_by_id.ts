import { BaseUserDORequest } from "./base_user_do_request";

export interface AdminDeletePositionByIDRequest extends BaseUserDORequest {
    positionID : string
}

export interface AdminDeletePositionByIDResponse {
    success: boolean
}