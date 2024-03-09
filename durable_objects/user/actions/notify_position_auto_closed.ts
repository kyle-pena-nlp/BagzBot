export interface NotifyPositionAutoClosedInfo {
	positionID : string
	tokenAddress: string
	vsTokenAddress:string
	amountTokenSold: number
	amountTokenUnsold: number
	willRetry : boolean
};


export interface NotifyPositionsAutoClosedRequest {
	notifyPositionAutoClosedInfos : NotifyPositionAutoClosedInfo[]
};

export interface NotifyPositionAutoClosedRequest {
	notifyPositionAutoClosedInfo : NotifyPositionAutoClosedInfo
}
