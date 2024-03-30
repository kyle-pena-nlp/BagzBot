// These all have to be 63 characters or less (callback_data must be less than 64 bytes)
// Oftentimes, there is also a menuArg, so it should be substantially less than 63 if possible.

export enum MenuCode {
	Main = "Main",
	Wallet = "Wallet",
	ViewDecryptedWallet = "View.PK",
	ListPositions = "List.POS",
	Invite = "Invite",
	FAQ = "FAQ",
	Error = "Error",
	NewPosition = "NewPosition",
	EditPositionHelp = "EditPositionHelp",
	TransferFunds = "TransferFunds",

	EditOpenPositionTriggerPercent = "EOP.Trigger",
	SubmitOpenPositionTriggerPct = "SEOP.Trigger",

	// welcome screen
	WelcomeScreenPart1 = "WelcomeScreenPart1",
	WelcomeScreenPart2 = "WelcomeScreenPart2",

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

	PleaseEnterToken = "PleaseEnterToken",
	ViewOpenPosition = "ViewOpenPosition",
	ClosePositionManuallyAction = "Pos.Close.Manually",

    TrailingStopLossRequestReturnToEditorMenu = "TLS.ReturnEditorMenu",

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

	// Trailing Stop Loss: auto-retry sell if slippage tolerance exceeded?
	TrailingStopLossChooseAutoRetrySellMenu = "TSL.AutoRetrySellMenu",
	TrailingStopLossChooseAutoRetrySellSubmit = "TSL.AutoRetrySellSubmit",

	TrailingStopLossEditorFinalSubmit = "TSL.EditorFinalSubmit",

	BetaFeedbackQuestion = "BetaFeedbackQuestion",
	SubmitBetaFeedback = "SubmitBetaFeedback",
	AdminDevSetPrice = "AdminDevSetPrice",
	SubmitAdminDevSetPrice = "SubmitAdminDevSetPrice",

	Close = "Close"
};