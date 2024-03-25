export interface GetLegalAgreementStatusRequest {

}

export interface GetLegalAgreementStatusResponse {
	status : 'agreed'|'refused'|'has-not-responded'
}
