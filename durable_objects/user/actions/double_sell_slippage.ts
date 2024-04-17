import { BaseUserDORequest } from "./base_user_do_request";

export interface DoubleSellSlippageRequest extends BaseUserDORequest {
    positionID : string
    markAsOpen : boolean
}

export interface DoubleSellSlippageResponse {
    
}