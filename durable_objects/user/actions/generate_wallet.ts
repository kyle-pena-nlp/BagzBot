import { BaseUserDORequest } from "./base_user_do_request";

export interface GenerateWalletRequest  extends BaseUserDORequest {

}

export interface GenerateWalletResponse {
    success: boolean
}