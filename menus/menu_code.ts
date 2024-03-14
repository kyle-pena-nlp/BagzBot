export enum MenuCode {
	Main = "Main",
	CreateWallet = "CreateWallet",
	Wallet = "Wallet",
	ListPositions = "ListPositions",
	Invite = "Invite",
	FAQ = "FAQ",
	Help = "Help",
	Error = "Error",
	
	PleaseEnterToken = "PleaseEnterToken",
	TransferFunds = "TransferFunds",
	RefreshWallet = "RefreshWallet",
	ExportWallet = "ExportWallet",
	ViewOpenPosition = "ViewOpenPosition",
	ClosePositionManuallyAction = "ClosePositionManuallyAction",

    TrailingStopLossRequestReturnToEditorMenu = "TLS.ReturnEditorMenu",

	// Trailing Stop Loss: set buy quantity in vsToken units
	TrailingStopLossEntryBuyQuantityMenu = "TSL.BuyQuantityMenu",
	TrailingStopLossEnterBuyQuantityKeypad = "TSL.BuyQuantityKeypad",
	TrailingStopLossEnterBuyQuantitySubmit = "TSL.BuyQuantitySubmit",

	// Trailing Stop Loss: set vsToken UI
	TrailingStopLossPickVsTokenMenu = "TSL.VsTokenMenu",
	TrailingStopLossPickVsTokenMenuSubmit = "TSL.VsTokenMenuSubmit",
	
	// Trailing Stop Loss: set slippage tolerance UI
	TrailingStopLossSlippagePctMenu = "TSL.SlippagePctMenu",
	TrailingStopLossCustomSlippagePctKeypad = "TSL.SlippagePctKeypad",
	TrailingStopLossCustomSlippagePctKeypadSubmit = "TSL.SlippageSubmit",

	// Trailing Stop Loss: set trigger percent UI
	TrailingStopLossTriggerPercentMenu = "TSL.TriggerPercentMenu",
	TrailingStopLossCustomTriggerPercentKeypad = "TSL.TriggerPercentKeypad", 
	TrailingStopLossCustomTriggerPercentKeypadSubmit = "TSL.TriggerPercentKeypadSubmit", 

	// Trailing Stop Loss: auto-retry sell if slippage tolerance exceeded?
	TrailingStopLossChooseAutoRetrySellMenu = "TSL.AutoRetrySellMenu",
	TrailingStopLossChooseAutoRetrySellSubmit = "TSL.AutoRetrySellSubmit",

	
	TrailingStopLossConfirmMenu = "TSL.ConfirmMenu",
	TrailingStopLossEditorFinalSubmit = "TSL.EditorFinalSubmit",

	Close = "Close"
};