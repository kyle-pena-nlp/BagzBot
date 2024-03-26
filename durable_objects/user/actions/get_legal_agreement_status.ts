import { BaseUserDORequest } from "./base_user_do_request";

export interface GetLegalAgreementStatusRequest  extends BaseUserDORequest {

}

export interface GetLegalAgreementStatusResponse {
	status : 'agreed'|'refused'|'has-not-responded'
}
