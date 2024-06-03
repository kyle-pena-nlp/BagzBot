import { MenuCode } from "../menus";
import { HandlerMap } from "../util";
import * as handlers from "./handlers";
import { BaseMenuCodeHandler } from "./handlers/base_menu_code_handler";

const WEN_LOGO = '<a href="https://shdw-drive.genesysgo.net/GwJapVHVvfM4Mw4sWszkzywncUWuxxPd6s9VuFfXRgie/wen_logo.png">\u200B</a>'
const SLERF_LOGO = '<a href="https://bafkreih44n5jgqpwuvimsxzroyebjunnm47jttqusb4ivagw3vsidil43y.ipfs.nftstorage.link/">\u200B</a>'

// todo: mock up price tracking on open positioin
// todo: new "x" editor screens
// todo: put position types into sub-menus
// todo: mock up referral sub-menus

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
    [MenuCode.SubmitAdminViewObject]: new handlers.SubmitAdminViewObjectHandler(MenuCode.SubmitAdminViewObject),

    /* Concept stuff */
    [MenuCode.NewRegularPosition]: new handlers.NoOpHandler(MenuCode.NewRegularPosition),


    [MenuCode.NewAutoBuy]: new handlers.NoOpHandler(MenuCode.NewAutoBuy),
    [MenuCode.ListRegularPositions]: new handlers.MetaMenuHandler(MenuCode.ListRegularPositions, {
        text: ["<b>Open Positions</b>"].join("\r\n"),
        buttons: [
            [
                { text: ":green: 0.10 SOL of $SLERF", menuCode: MenuCode.ViewRegularPosition }
            ],
            [
                { text: ":green: 0.22 SOL of $APES", menuCode: MenuCode.ViewRegularPosition }
            ],
            [
                { text: ":green: 0.34 SOL of $POPCAT", menuCode: MenuCode.ViewRegularPosition }
            ]
        ],
        thisMenuCode: MenuCode.ListRegularPositions,
        backMenuCode: MenuCode.Main,
        includeRefresh: true
    }),

    [MenuCode.ListAutoBuys]: new handlers.MetaMenuHandler(MenuCode.ListAutoBuys, {
        text: ["<b>Active Auto-Buys</b>", "<i>Click to open and adjust settings</i>"].join("\r\n"),

        buttons: [
            [
                { text: ":green: 0.50 SOL $WEN :bullet: VOL :bullet: :down_arrow: 3% ", menuCode: MenuCode.ViewAutoBuy }
            ],
            [
                { text: ":green: 0.25 SOL $BRETT :bullet: SELL % :bullet: > 50%", menuCode: MenuCode.ViewAutoBuy }
            ],
            [
                { text: ":green: 0.25 SOL $BRETT :bullet: SELL % :bullet: > 50%", menuCode: MenuCode.ViewAutoBuy }
            ],
        ],
        thisMenuCode: MenuCode.ListAutoBuys,
        backMenuCode: MenuCode.Main,
        includeRefresh: true
    }),

    [MenuCode.Referrals]: new handlers.MetaMenuHandler(MenuCode.Referrals, {
        text: "<b>Manage And Send Referrals</b>",
        buttons: [
            [
                "View Accepted Referrals"
            ],
            [
                "Get New Referral"
            ]
        ],
        thisMenuCode: MenuCode.Referrals,
        backMenuCode: MenuCode.Main
    }),

    [MenuCode.Settings]: new handlers.MetaMenuHandler(MenuCode.Settings, {
        text: "Adjust your settings here",
        buttons: [
            [
                "Automatic Buys: On"
            ],
            [
                { text: "Automatic Buy Settings", menuCode: MenuCode.AutomaticBuySettings }
            ]
        ],
        thisMenuCode: MenuCode.Settings,
        backMenuCode: MenuCode.Main
    }),

    [MenuCode.AutomaticBuySettings]: new handlers.MetaMenuHandler(MenuCode.AutomaticBuySettings, {
        text: "Adjust your settings for Automatic Buys",
        buttons: [
            [
                "Automatic Buy Type: Regular Position"
            ],
            [
                "Buy Amount: 0.1 SOL"
            ],
            [
                "Slippage: 1%"
            ],
            [
                "Priority Fees: Boosted"
            ]
        ],
        thisMenuCode: MenuCode.AutomaticBuySettings,
        backMenuCode: MenuCode.Settings
    }),

    [MenuCode.ViewRegularPosition]: new handlers.MetaMenuHandler(MenuCode.AutomaticBuySettings, {
        text: [`${SLERF_LOGO}<b>Open Position</b>: 0.10 SOL of $SLERF`,'<i>Adjust your settings below.</i>'].join("\r\n"),
        buttons: [
            [
                ":sparkle: Sell Now :sparkle:"
            ],
            [
                "Slippage: 1%"
            ],
            [
                "Priority Fees: Boosted"
            ]
        ],
        thisMenuCode: MenuCode.ViewRegularPosition,
        backMenuCode: MenuCode.ListRegularPositions,
        includeRefresh: true
    }),
    [MenuCode.ViewAutoBuy]: new handlers.MetaMenuHandler(MenuCode.ViewAutoBuy, {
        text: [
            `${WEN_LOGO}<b>Auto-Buy</b> <code>0.50</code> SOL of $WEN`, 
            "",
            "<b>Interpretation:</b>",
            "<code>0.50</code> SOL of $WEN will be purchased when VOLUME decreases by 3% from peak",
            "",
            "<i>Adjust your settings here.</i>"].join("\r\n"),
        buttons: [
            [
                "TRIGGER:","VOL",":down_arrow:","3%"
            ],
            [
                "Token: $WEN", "Amount: 0.50 SOL", "Type: Regular",
            ],
            [
                "Slippage: 1%",  "Priority Fees: Boosted"
            ],
            [
                ":cancel: Cancel Auto-Buy"
            ],
        ],
        thisMenuCode: MenuCode.ViewAutoBuy,
        backMenuCode: MenuCode.ListAutoBuys,
        includeRefresh: true
    })
}
