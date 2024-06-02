import { MenuCode } from "../menus";
import { HandlerMap } from "../util";
import * as handlers from "./handlers";
import { BaseMenuCodeHandler } from "./handlers/base_menu_code_handler";

export const MenuCodeHandlerMap : HandlerMap<MenuCode,BaseMenuCodeHandler<MenuCode>> = {
    [MenuCode.Main]: new handlers.MainHandler(MenuCode.Main),
    [MenuCode.Wallet]: new handlers.WalletHandler(MenuCode.Wallet),
    [MenuCode.ViewDecryptedWallet]: new handlers.ViewDecryptedWalletHandler(MenuCode.ViewDecryptedWallet),
    [MenuCode.ListPositions]: new handlers.ListPositionsHandler(MenuCode.ListPositions),
    [MenuCode.FAQ]: new handlers.FAQHandler(MenuCode.FAQ),
    [MenuCode.Error]: new handlers.ErrorHandler(MenuCode.Error),
    [MenuCode.NewPosition]: new handlers.NewPositionHandler(MenuCode.NewPosition),
    [MenuCode.EditPositionHelp]: new handlers.EditPositionHelpHandler(MenuCode.EditPositionHelp),
    [MenuCode.TransferFunds]: new handlers.TransferFundsHandler(MenuCode.TransferFunds),
    [MenuCode.AdminDeleteAllPositions]: new handlers.AdminDeleteAllPositionsHandler(MenuCode.AdminDeleteAllPositions),
    [MenuCode.EditOpenPositionSellSlippagePercent]: new handlers.EditOpenPositionSellSlippagePercentHandler(MenuCode.EditOpenPositionSellSlippagePercent),
    [MenuCode.SubmitOpenPositionSellSlippagePercent]: new handlers.SubmitOpenPositionSellSlippagePercentHandler(MenuCode.SubmitOpenPositionSellSlippagePercent),
    [MenuCode.AdminSendUserMessage]: new handlers.AdminSendUserMessageHandler(MenuCode.AdminSendUserMessage),
    [MenuCode.SubmitAdminSendUserMessage]: new handlers.SubmitAdminSendUserMessageHandler(MenuCode.SubmitAdminSendUserMessage),
    [MenuCode.ViewPNLHistory]: new handlers.ViewPNLHistoryHandler(MenuCode.ViewPNLHistory),
    [MenuCode.ComingSoon]: new handlers.ComingSoonHandler(MenuCode.ComingSoon),
    [MenuCode.AdminCountPositions]: new handlers.AdminCountPositionsHandler(MenuCode.AdminCountPositions),
    [MenuCode.MenuWhatIsTSL]: new handlers.MenuWhatIsTSLHandler(MenuCode.MenuWhatIsTSL),
    [MenuCode.AdminResetPositionRequestDefaults]: new handlers.AdminResetPositionRequestDefaultsHandler(MenuCode.AdminResetPositionRequestDefaults),
    [MenuCode.AdminDeleteClosedPositions]: new handlers.AdminDeleteClosedPositionsHandler(MenuCode.AdminDeleteClosedPositions),
    [MenuCode.AdminViewClosedPositions]: new handlers.AdminViewClosedPositionsHandler(MenuCode.AdminViewClosedPositions),
    [MenuCode.AdminViewClosedPosition]: new handlers.AdminViewClosedPositionHandler(MenuCode.AdminViewClosedPosition),
    [MenuCode.AdminDeletePositionByID]: new handlers.AdminDeletePositionByIDHandler(MenuCode.AdminDeletePositionByID),
    [MenuCode.SubmitAdminDeletePositionByID]: new handlers.SubmitAdminDeletePositionByIDHandler(MenuCode.SubmitAdminDeletePositionByID),
    [MenuCode.PosRequestChooseAutoDoubleSlippageOptions]: new handlers.PosRequestChooseAutoDoubleSlippageOptionsHandler(MenuCode.PosRequestChooseAutoDoubleSlippageOptions),
    [MenuCode.SubmitPosRequestAutoDoubleSlippageOptions]: new handlers.SubmitPosRequestAutoDoubleSlippageOptionsHandler(MenuCode.SubmitPosRequestAutoDoubleSlippageOptions),
    [MenuCode.ReactivatePosition]: new handlers.ReactivatePositionHandler(MenuCode.ReactivatePosition),
    [MenuCode.DeactivatePosition]: new handlers.DeactivatePositionHandler(MenuCode.DeactivatePosition),
    [MenuCode.ViewDeactivatedPositions]: new handlers.ViewDeactivatedPositionsHandler(MenuCode.ViewDeactivatedPositions),
    [MenuCode.ViewDeactivatedPosition]: new handlers.ViewDeactivatedPositionHandler(MenuCode.ViewDeactivatedPosition),
    [MenuCode.EditOpenPositionPriorityFee]: new handlers.EditOpenPositionPriorityFeeHandler(MenuCode.EditOpenPositionPriorityFee),
    [MenuCode.EditOpenPositionSubmitPriorityFee]: new handlers.EditOpenPositionSubmitPriorityFeeHandler(MenuCode.EditOpenPositionSubmitPriorityFee),
    [MenuCode.EditOpenPositionCustomTriggerPercent]: new handlers.EditOpenPositionCustomTriggerPercentHandler(MenuCode.EditOpenPositionCustomTriggerPercent),
    [MenuCode.EditOpenPositionSubmitCustomTriggerPercent]: new handlers.EditOpenPositionSubmitCustomTriggerPercentHandler(MenuCode.EditOpenPositionSubmitCustomTriggerPercent),
    [MenuCode.EditOpenPositionCustomSlippagePercent]: new handlers.EditOpenPositionCustomSlippagePercentHandler(MenuCode.EditOpenPositionCustomSlippagePercent),
    [MenuCode.EditOpenPositionSubmitCustomSlippagePercent]: new handlers.EditOpenPositionSubmitCustomSlippagePercentHandler(MenuCode.EditOpenPositionSubmitCustomSlippagePercent),
    [MenuCode.EditOpenPositionAutoDoubleSlippage]: new handlers.EditOpenPositionAutoDoubleSlippageHandler(MenuCode.EditOpenPositionAutoDoubleSlippage),
    [MenuCode.SubmitOpenPositionAutoDoubleSlippage]: new handlers.SubmitOpenPositionAutoDoubleSlippageHandler(MenuCode.SubmitOpenPositionAutoDoubleSlippage),
    [MenuCode.EditPositionRequestPriorityFees]: new handlers.EditPositionRequestPriorityFeesHandler(MenuCode.EditPositionRequestPriorityFees),
    [MenuCode.EditPositionRequestSubmitPriorityFees]: new handlers.EditPositionRequestSubmitPriorityFeesHandler(MenuCode.EditPositionRequestSubmitPriorityFees),
    [MenuCode.EditOpenPositionTriggerPercent]: new handlers.EditOpenPositionTriggerPercentHandler(MenuCode.EditOpenPositionTriggerPercent),
    [MenuCode.SubmitOpenPositionTriggerPct]: new handlers.SubmitOpenPositionTriggerPctHandler(MenuCode.SubmitOpenPositionTriggerPct),
    [MenuCode.WelcomeScreenPart1]: new handlers.WelcomeScreenPart1Handler(MenuCode.WelcomeScreenPart1),
    [MenuCode.BetaGateInviteFriends]: new handlers.BetaGateInviteFriendsHandler(MenuCode.BetaGateInviteFriends),
    [MenuCode.LegalAgreement]: new handlers.LegalAgreementHandler(MenuCode.LegalAgreement),
    [MenuCode.LegalAgreementAgree]: new handlers.LegalAgreementAgreeHandler(MenuCode.LegalAgreementAgree),
    [MenuCode.LegalAgreementRefuse]: new handlers.LegalAgreementRefuseHandler(MenuCode.LegalAgreementRefuse),
    [MenuCode.ImpersonateUser]: new handlers.ImpersonateUserHandler(MenuCode.ImpersonateUser),
    [MenuCode.UnimpersonateUser]: new handlers.UnimpersonateUserHandler(MenuCode.UnimpersonateUser),
    [MenuCode.SubmitImpersonateUser]: new handlers.SubmitImpersonateUserHandler(MenuCode.SubmitImpersonateUser),
    [MenuCode.ViewOpenPosition]: new handlers.ViewOpenPositionHandler(MenuCode.ViewOpenPosition),
    [MenuCode.ClosePositionManuallyAction]: new handlers.ClosePositionManuallyActionHandler(MenuCode.ClosePositionManuallyAction),
    [MenuCode.ReturnToPositionRequestEditor]: new handlers.ReturnToPositionRequestEditorHandler(MenuCode.ReturnToPositionRequestEditor),
    [MenuCode.TrailingStopLossEntryBuyQuantityMenu]: new handlers.TrailingStopLossEntryBuyQuantityMenuHandler(MenuCode.TrailingStopLossEntryBuyQuantityMenu),
    [MenuCode.CustomBuyQuantity]: new handlers.CustomBuyQuantityHandler(MenuCode.CustomBuyQuantity),
    [MenuCode.SubmitBuyQuantity]: new handlers.SubmitBuyQuantityHandler(MenuCode.SubmitBuyQuantity),
    [MenuCode.EditPositionChangeToken]: new handlers.EditPositionChangeTokenHandler(MenuCode.EditPositionChangeToken),
    [MenuCode.EditPositionChangeTokenSubmit]: new handlers.EditPositionChangeTokenSubmitHandler(MenuCode.EditPositionChangeTokenSubmit),
    [MenuCode.TrailingStopLossPickVsTokenMenu]: new handlers.TrailingStopLossPickVsTokenMenuHandler(MenuCode.TrailingStopLossPickVsTokenMenu),
    [MenuCode.TrailingStopLossPickVsTokenMenuSubmit]: new handlers.TrailingStopLossPickVsTokenMenuSubmitHandler(MenuCode.TrailingStopLossPickVsTokenMenuSubmit),
    [MenuCode.TrailingStopLossSlippagePctMenu]: new handlers.TrailingStopLossSlippagePctMenuHandler(MenuCode.TrailingStopLossSlippagePctMenu),
    [MenuCode.CustomSlippagePct]: new handlers.CustomSlippagePctHandler(MenuCode.CustomSlippagePct),
    [MenuCode.SubmitSlippagePct]: new handlers.SubmitSlippagePctHandler(MenuCode.SubmitSlippagePct),
    [MenuCode.TrailingStopLossTriggerPercentMenu]: new handlers.TrailingStopLossTriggerPercentMenuHandler(MenuCode.TrailingStopLossTriggerPercentMenu),
    [MenuCode.CustomTriggerPct]: new handlers.CustomTriggerPctHandler(MenuCode.CustomTriggerPct),
    [MenuCode.SubmitTriggerPct]: new handlers.SubmitTriggerPctHandler(MenuCode.SubmitTriggerPct),
    [MenuCode.TrailingStopLossEditorFinalSubmit]: new handlers.TrailingStopLossEditorFinalSubmitHandler(MenuCode.TrailingStopLossEditorFinalSubmit),
    [MenuCode.BetaFeedbackQuestion]: new handlers.BetaFeedbackQuestionHandler(MenuCode.BetaFeedbackQuestion),
    [MenuCode.SubmitBetaFeedback]: new handlers.SubmitBetaFeedbackHandler(MenuCode.SubmitBetaFeedback),
    [MenuCode.AdminDevSetPrice]: new handlers.AdminDevSetPriceHandler(MenuCode.AdminDevSetPrice),
    [MenuCode.SubmitAdminDevSetPrice]: new handlers.SubmitAdminDevSetPriceHandler(MenuCode.SubmitAdminDevSetPrice),
    [MenuCode.AdminInvokeAlarm]: new handlers.AdminInvokeAlarmHandler(MenuCode.AdminInvokeAlarm),
    [MenuCode.SubmitAdminInvokeAlarm]: new handlers.SubmitAdminInvokeAlarmHandler(MenuCode.SubmitAdminInvokeAlarm),
    [MenuCode.Close]: new handlers.CloseHandler(MenuCode.Close),
    [MenuCode.AdminViewObject]: new handlers.AdminViewObjectHandler(MenuCode.AdminViewObject),
    [MenuCode.SubmitAdminViewObject]: new handlers.SubmitAdminViewObjectHandler(MenuCode.SubmitAdminViewObject)
}
