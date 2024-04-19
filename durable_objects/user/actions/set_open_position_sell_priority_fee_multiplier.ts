import { BaseUserDORequest } from "./base_user_do_request";

export interface SetOpenPositionSellPriorityFeeMultiplierRequest extends BaseUserDORequest {
    positionID : string
    multiplier : 'auto'|number
}

export interface SetOpenPositionSellPriorityFeeMultiplierResponse {
    
}