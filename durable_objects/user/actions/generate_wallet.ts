import { BaseUserAction } from "./base_user_action";

export interface GenerateWalletRequest  extends BaseUserAction {

}

export interface GenerateWalletResponse {
    success: boolean
}