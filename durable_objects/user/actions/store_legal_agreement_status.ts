import { BaseUserDORequest } from "./base_user_do_request";

export interface StoreLegalAgreementStatusRequest  extends BaseUserDORequest {
	status : 'agreed'|'refused'
}

export interface StoreLegalAgreementStatusResponse {

}