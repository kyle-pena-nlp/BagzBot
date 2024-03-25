import { BaseUserDORequest } from "./base_user_action";

export interface GetLegalAgreementStatusRequest  extends BaseUserDORequest {

}

export interface GetLegalAgreementStatusResponse {
	status : 'agreed'|'refused'|'has-not-responded'
}
