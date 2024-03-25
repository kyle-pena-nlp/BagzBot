import { BaseUserAction } from "./base_user_action";

export interface GetLegalAgreementStatusRequest  extends BaseUserAction {

}

export interface GetLegalAgreementStatusResponse {
	status : 'agreed'|'refused'|'has-not-responded'
}
