import { DecimalizedAmount } from "../../../decimalized";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetUserWalletSOLBalanceRequest extends BaseUserDORequest {

}

export interface GetUserWalletSOLBalanceResponse {
    maybeSOLBalance : DecimalizedAmount|null
}