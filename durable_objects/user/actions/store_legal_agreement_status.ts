import { BaseUserDORequest } from "./base_user_action";

export interface StoreLegalAgreementStatusRequest  extends BaseUserDORequest {
	status : 'agreed'|'refused'
}

export interface StoreLegalAgreementStatusResponse {

}