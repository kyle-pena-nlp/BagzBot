import { MenuCode } from "../../menus";
import { TelegramWebhookInfo } from "../../telegram";
import { HandlerMap } from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";

export interface MenuCodeHandler {
    handle(params : CallbackHandlerParams|TelegramWebhookInfo) : Promise<void>;
}

export class MenuCodeTODOHandler {
    async handle() : Promise<void> {
    }
}

export const MenuCodeHandlerMap : HandlerMap<MenuCode,MenuCodeHandler> = {
    [MenuCode.Main]: new MenuCodeTODOHandler(),
    [MenuCode.Wallet]: new MenuCodeTODOHandler(),
    [MenuCode.ViewDecryptedWallet]: new MenuCodeTODOHandler(),
    [MenuCode.ListPositions]: new MenuCodeTODOHandler(),
    [MenuCode.FAQ]: new MenuCodeTODOHandler(),
    [MenuCode.Error]: new MenuCodeTODOHandler(),
    [MenuCode.NewPosition]: new MenuCodeTODOHandler(),
    [MenuCode.EditPositionHelp]: new MenuCodeTODOHandler(),
    [MenuCode.TransferFunds]: new MenuCodeTODOHandler(),
    [MenuCode.AdminDeleteAllPositions]: new MenuCodeTODOHandler(),
    [MenuCode.EditOpenPositionSellSlippagePercent]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitOpenPositionSellSlippagePercent]: new MenuCodeTODOHandler(),
    [MenuCode.AdminSendUserMessage]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitAdminSendUserMessage]: new MenuCodeTODOHandler(),
    [MenuCode.ViewPNLHistory]: new MenuCodeTODOHandler(),
    [MenuCode.ComingSoon]: new MenuCodeTODOHandler(),
    [MenuCode.AdminCountPositions]: new MenuCodeTODOHandler(),
    [MenuCode.MenuWhatIsTSL]: new MenuCodeTODOHandler(),
    [MenuCode.AdminResetPositionRequestDefaults]: new MenuCodeTODOHandler(),
    [MenuCode.AdminDeleteClosedPositions]: new MenuCodeTODOHandler(),
    [MenuCode.AdminViewClosedPositions]: new MenuCodeTODOHandler(),
    [MenuCode.AdminViewClosedPosition]: new MenuCodeTODOHandler(),
    [MenuCode.AdminDeletePositionByID]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitAdminDeletePositionByID]: new MenuCodeTODOHandler(),
    [MenuCode.PosRequestChooseAutoDoubleSlippageOptions]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitPosRequestAutoDoubleSlippageOptions]: new MenuCodeTODOHandler(),
    [MenuCode.ReactivatePosition]: new MenuCodeTODOHandler(),
    [MenuCode.DeactivatePosition]: new MenuCodeTODOHandler(),
    [MenuCode.ViewDeactivatedPositions]: new MenuCodeTODOHandler(),
    [MenuCode.ViewDeactivatedPosition]: new MenuCodeTODOHandler(),
    [MenuCode.EditOpenPositionAutoDoubleSlippage]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitOpenPositionAutoDoubleSlippage]: new MenuCodeTODOHandler(),
    [MenuCode.EditOpenPositionTriggerPercent]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitOpenPositionTriggerPct]: new MenuCodeTODOHandler(),
    [MenuCode.WelcomeScreenPart1]: new MenuCodeTODOHandler(),
    [MenuCode.BetaGateInviteFriends]: new MenuCodeTODOHandler(),
    [MenuCode.LegalAgreement]: new MenuCodeTODOHandler(),
    [MenuCode.LegalAgreementAgree]: new MenuCodeTODOHandler(),
    [MenuCode.LegalAgreementRefuse]: new MenuCodeTODOHandler(),
    [MenuCode.ImpersonateUser]: new MenuCodeTODOHandler(),
    [MenuCode.UnimpersonateUser]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitImpersonateUser]: new MenuCodeTODOHandler(),
    [MenuCode.ViewOpenPosition]: new MenuCodeTODOHandler(),
    [MenuCode.ClosePositionManuallyAction]: new MenuCodeTODOHandler(),
    [MenuCode.ReturnToPositionRequestEditor]: new MenuCodeTODOHandler(),
    [MenuCode.TrailingStopLossEntryBuyQuantityMenu]: new MenuCodeTODOHandler(),
    [MenuCode.CustomBuyQuantity]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitBuyQuantity]: new MenuCodeTODOHandler(),
    [MenuCode.EditPositionChangeToken]: new MenuCodeTODOHandler(),
    [MenuCode.EditPositionChangeTokenSubmit]: new MenuCodeTODOHandler(),
    [MenuCode.TrailingStopLossPickVsTokenMenu]: new MenuCodeTODOHandler(),
    [MenuCode.TrailingStopLossPickVsTokenMenuSubmit]: new MenuCodeTODOHandler(),
    [MenuCode.TrailingStopLossSlippagePctMenu]: new MenuCodeTODOHandler(),
    [MenuCode.CustomSlippagePct]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitSlippagePct]: new MenuCodeTODOHandler(),
    [MenuCode.TrailingStopLossTriggerPercentMenu]: new MenuCodeTODOHandler(),
    [MenuCode.CustomTriggerPct]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitTriggerPct]: new MenuCodeTODOHandler(),
    [MenuCode.TrailingStopLossEditorFinalSubmit]: new MenuCodeTODOHandler(),
    [MenuCode.BetaFeedbackQuestion]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitBetaFeedback]: new MenuCodeTODOHandler(),
    [MenuCode.AdminDevSetPrice]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitAdminDevSetPrice]: new MenuCodeTODOHandler(),
    [MenuCode.AdminInvokeAlarm]: new MenuCodeTODOHandler(),
    [MenuCode.SubmitAdminInvokeAlarm]: new MenuCodeTODOHandler(),
    [MenuCode.Close]: new MenuCodeTODOHandler(),
    [MenuCode.EditPositionRequestPriorityFees]: new MenuCodeTODOHandler(),
    [MenuCode.EditPositionRequestSubmitPriorityFees]: new MenuCodeTODOHandler(),
    [MenuCode.EditOpenPositionPriorityFee]: new MenuCodeTODOHandler(),
    [MenuCode.EditOpenPositionSubmitPriorityFee]: new MenuCodeTODOHandler()    
}