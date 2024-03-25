import { Wallet } from "../../../crypto";
import { BaseUserAction } from "./base_user_action";

export interface GetWalletDataRequest  extends BaseUserAction {
}

export interface GetWalletDataResponse {
    wallet : Wallet
}