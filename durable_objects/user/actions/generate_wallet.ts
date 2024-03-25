import { BaseUserDORequest } from "./base_user_action";

export interface GenerateWalletRequest  extends BaseUserDORequest {

}

export interface GenerateWalletResponse {
    success: boolean
}