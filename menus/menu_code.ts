// These all have to be 63 characters or less (callback_data must be less than 64 bytes)
// Oftentimes, there is also a menuArg, so it should be substantially less than 63 if possible.

export enum MenuCode {
	Main = "Main",
	Wallet = "Wallet",
	ViewDecryptedWallet = "View.PK",
	ListPositions = "List.POS",
	FAQ = "FAQ",
	Error = "Error",
	NewPosition = "NewPosition",
	EditPositionHelp = "EditPositionHelp",
	TransferFunds = "TransferFunds",
	AdminDeleteAllPositions = "AdminDeleteAllPositions",
	EditOpenPositionSellSlippagePercent = "EOP.SellSlippagePercent",
	SubmitOpenPositionSellSlippagePercent = "SOP.SellSlippagePercent",
	AdminSendUserMessage = "AdminSendUserMessage",
	SubmitAdminSendUserMessage = "SubmitAdminSendUserMessage",
	ViewPNLHistory = "ViewPNLHistory",
	ComingSoon = "CS", // as short as possible to make room for the coming soon message
	AdminCountPositions = "AdminCountPositions",
	MenuWhatIsTSL = "MenuWhatIsTSL",
	AdminViewObject = "AdminViewObject",
	SubmitAdminViewObject = "SubmitAdminViewObject",
	AdminResetPositionRequestDefaults = "AdminResetPositionRequestDefaults",
	AdminDeleteClosedPositions = "AdminDeleteClosedPositions",
	AdminViewClosedPositions = "AdminViewClosedPositions",
	AdminViewClosedPosition = "AdminViewClosedPosition",
	AdminDeletePositionByID = "AdminDeletePositionByID",
	SubmitAdminDeletePositionByID = "SubmitAdminDeletePositionByID",
	PosRequestChooseAutoDoubleSlippageOptions = "EPR.AutoDoubleSlip",
	SubmitPosRequestAutoDoubleSlippageOptions = "SPR.AutoDoubleSlip",
	ReactivatePosition = "ReactivatePosition",
	DeactivatePosition = "DeactivatePosition",
	ViewDeactivatedPositions = "ListDeactivatedPositions",
	ViewDeactivatedPosition = "ViewDeactivatedPosition", 
	EditOpenPositionPriorityFee = "EOP.PriorityFee",
	EditOpenPositionSubmitPriorityFee = "EOP.SubmitPriorityFee",

	EditOpenPositionCustomTriggerPercent = "EOP.CustomTriggerPct",
	EditOpenPositionSubmitCustomTriggerPercent = "EOP.SubmitCustomTriggerPct",
	EditOpenPositionCustomSlippagePercent = "EOP.CustomSlippagePct",
	EditOpenPositionSubmitCustomSlippagePercent = "EOP.SubmitCustomSlippagePct",

	EditOpenPositionAutoDoubleSlippage = "EOP.AutoDoubleSlip",
	SubmitOpenPositionAutoDoubleSlippage = "SOP.AutoDoubleSlip",
	EditPositionRequestPriorityFees = "EOPR.PriorityFee",
	EditPositionRequestSubmitPriorityFees = "SOPR.PriorityFees",

	EditOpenPositionTriggerPercent = "EOP.Trigger",
	SubmitOpenPositionTriggerPct = "SEOP.Trigger",

	// welcome screen
	WelcomeScreenPart1 = "WelcomeScreenPart1",

	// beta invite
	BetaGateInviteFriends = "BetaGateInviteFriends",

	// legal
	LegalAgreement = "LegalAgreement",
	LegalAgreementAgree = "LegalAgreementAgree",
	LegalAgreementRefuse = "LegalAgreementRefuse",
	
	// user impersonation
	ImpersonateUser = "ImpersonateUser",
	UnimpersonateUser = "UnimpersonateUser",
	SubmitImpersonateUser = "SubmitImpersonateUser",

	ViewOpenPosition = "ViewOpenPosition",
	ClosePositionManuallyAction = "Pos.Close.Manually",

    ReturnToPositionRequestEditor = "TLS.ReturnEditorMenu",

	// Trailing Stop Loss: set buy quantity in vsToken units
	TrailingStopLossEntryBuyQuantityMenu = "TSL.BuyQuantityMenu",
	CustomBuyQuantity = "TSL.BuyQuantityKeypad",
	SubmitBuyQuantity = "TSL.BuyQuantitySubmit",

	// switch which token you are buying
	EditPositionChangeToken = "EditPositionChangeToken",
	EditPositionChangeTokenSubmit = "EditPositionChangeTokenSubmit",

	// Trailing Stop Loss: set vsToken UI
	TrailingStopLossPickVsTokenMenu = "TSL.VsTokenMenu",
	TrailingStopLossPickVsTokenMenuSubmit = "TSL.VsTokenMenuSubmit",
	
	// Trailing Stop Loss: set slippage tolerance UI
	TrailingStopLossSlippagePctMenu = "TSL.SlippagePctMenu",
	CustomSlippagePct = "TSL.SlippagePctKeypad",
	SubmitSlippagePct = "TSL.SlippageSubmit",

	// Trailing Stop Loss: set trigger percent UI
	TrailingStopLossTriggerPercentMenu = "TSL.TriggerPercentMenu",
	CustomTriggerPct = "TSL.TriggerPercentKeypad", 
	SubmitTriggerPct = "TSL.TriggerPercentKeypadSubmit", 

	TrailingStopLossEditorFinalSubmit = "TSL.EditorFinalSubmit",

	BetaFeedbackQuestion = "BetaFeedbackQuestion",
	SubmitBetaFeedback = "SubmitBetaFeedback",
	AdminDevSetPrice = "AdminDevSetPrice",
	SubmitAdminDevSetPrice = "SubmitAdminDevSetPrice",

	AdminInvokeAlarm = "AdminInvokeAlarm",
	SubmitAdminInvokeAlarm = "SubmitAdminInvokeAlarm",

	Close = "Close"
};