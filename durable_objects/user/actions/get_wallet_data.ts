import { Wallet } from "../../../crypto";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetWalletDataRequest  extends BaseUserDORequest {
}

export interface GetWalletDataResponse {
    wallet : Wallet
}