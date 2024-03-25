import { BaseUserAction } from "./base_user_action";

export interface StoreLegalAgreementStatusRequest  extends BaseUserAction {
	status : 'agreed'|'refused'
}

export interface StoreLegalAgreementStatusResponse {

}