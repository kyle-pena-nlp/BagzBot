import { Position } from "../../../positions";
import { SwapStatus } from "../model/swap_status";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ConfirmBuysRequest extends BaseUserDORequest {
    positions : Position[]
}

export interface ConfirmBuysResponse {
    results : Record<string,SwapStatus>
}