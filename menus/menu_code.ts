// These all have to be 63 characters or less (callback_data must be less than 64 bytes)
// Oftentimes, there is also a menuArg, so it should be substantially less than 63 if possible.

export enum MenuCode {
	Main = "Main",
	CreateWallet = "CreateWallet",
	Wallet = "Wallet",
	ViewDecryptedWallet = "View.PK",
	ListPositions = "List.POS",
	Invite = "Invite",
	FAQ = "FAQ",
	Help = "Help",
	Error = "Error",
	
	// address book stuff
	SubmitAddressBookEntryName = "Submit.ABE.N",
	SubmitAddressBookEntryAddress = "Submit.ABE.A",
	AddressBookEntryPerformTestTransfer  = "Test.ABE.FT",
	SubmitAddressBookEntry = "Submit.ABE",
	RemoveAddressBookEntry = "Remove.ABE",
	PickTransferFundsRecipient = "Pick.ABE.FT",
	TransferFundsRecipientSubmitted = "FT.Sub",
	KeypadTransferFundsQuantity = "FT.Keypad",
	SubmitTransferFundsQuantity = "FT.Q.Sub",
	TransferFundsDoTransfer = "FT.DoIt",
	TransferFundsDoTestTransfer = "FT.TestIt",

	PleaseEnterToken = "PleaseEnterToken",
	TransferFunds = "TransferFunds",
	AddFundsRecipientAddress = "AddFundsRecipientAddress",
	ViewOpenPosition = "ViewOpenPosition",
	ClosePositionManuallyAction = "Pos.Close.Manually",

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