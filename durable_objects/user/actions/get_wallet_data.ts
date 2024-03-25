import { Wallet } from "../../../crypto";
import { BaseUserDORequest } from "./base_user_action";

export interface GetWalletDataRequest  extends BaseUserDORequest {
}

export interface GetWalletDataResponse {
    wallet : Wallet
}