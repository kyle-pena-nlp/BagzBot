import { MenuCode, logoHack } from "../menus";
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
    [MenuCode.NewRegularPosition]: new handlers.MetaMenuHandler(MenuCode.NewRegularPosition, {
        text: [
            `${SLERF_LOGO}<u><b>Create Open Position</b></u>: (<b>7,986.2419 of</b> $SLERF)`,
            '<code>7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3</code>',
            '',
            ':bullet:<code>Current Price:   </code>0.0₅1253 SOL ',
            '',
            '<i>Adjust your settings below.</i>'
        ].join("\r\n"),
        buttons: [
            [
                ":pencil: Change Token"
            ],
            [
                "Slippage: 1%"
            ],
            [
                "Priority Fees: Boosted"
            ]
        ],
        thisMenuCode: MenuCode.NewRegularPosition,
        backMenuCode: MenuCode.RegPosMainMenu,
        includeRefresh: true
    }),


    [MenuCode.NewAutoBuy]: new handlers.MetaMenuHandler(MenuCode.NewAutoBuy, {
        text: [
            `${WEN_LOGO}<b>Create New Auto-Buy Position </b>`,
            "(<code>WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk</code>)",
            "",
            "<b>Interpretation:</b>",
            "<code>0.50</code> SOL of $WEN will be purchased when VOLUME decreases by 3% from latest peak",
            "",
            "<i>Adjust your settings here.</i>"
        ].join("\r\n"),
        buttons: [
            [
                "TRIGGER:", "VOL :mountain:", ":down_arrow:", "3%"
            ],
            [
                ":pencil: Change Token", ":dollars: 0.50 SOL", "Type: Regular",
            ],
            [
                ":twisted_arrows: Slippage: 1%", "Priority Fees: Boosted"
            ],
            [
                ":sparkle: Create Auto-Buy Position :sparkle:"
            ],
        ],
        thisMenuCode: MenuCode.NewAutoBuy,
        backMenuCode: MenuCode.AutoBuyMainMenu,
        includeRefresh: true
    }),


    [MenuCode.ListRegularPositions]: new handlers.MetaMenuHandler(MenuCode.ListRegularPositions, {
        text: ["<b>Your Open Positions</b>"].join("\r\n"),
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
        backMenuCode: MenuCode.RegPosMainMenu,
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
        backMenuCode: MenuCode.AutoBuyMainMenu,
        includeRefresh: true
    }),

    [MenuCode.Referrals]: new handlers.MetaMenuHandler(MenuCode.Referrals, {
        text: [
            `${logoHack()}:ticket: <b>Manage And Send Referrals</b> :ticket:`,
            ":bullet: You have sent 14 referrals",
            ":bullet: Of these, 3 actively traded this week",
            "",
            "<i>Send new referrals or engage with your existing referrals here:</i>"
        ].join("\r\n"),
        buttons: [
            [
                { text: "View Referral Activity", menuCode: MenuCode.EngageReferrals }
            ],
            [
                { text: "Send New Referrals", menuCode: MenuCode.GetReferralLink }
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
        text: [
            `${SLERF_LOGO}<u><b>Your Open Position</b></u>: (<b>7,986.2419 of</b> $SLERF)`,
            '<code>7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3</code>',
            '',
            '<b><u>Price Movement</u></b>',
            ':bullet:<code>Current Price:   </code>0.0₅1253 SOL ',
            ':bullet:<code>Profit:          </code>+0.0₅7682 SOL (+0.07%)',
            '',
            '<i>Adjust your settings below.</i>'
        ].join("\r\n"),
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
            `${WEN_LOGO}:green: <b>Your Auto-Buy Position </b>`,
            "(<code>WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk</code>)",
            "",
            "<b>Interpretation:</b>",
            "<code>0.50</code> SOL of $WEN will be purchased when VOLUME decreases by 3% from peak",
            "",
            "<i>Adjust your settings here.</i>"
        ].join("\r\n"),
        buttons: [
            [
                "TRIGGER:", "VOL :mountain:", ":down_arrow:", "3%"
            ],
            [
                ":pencil: Change Token", ":dollars: 0.50 SOL", "Type: Regular",
            ],
            [
                ":twisted_arrows: Slippage: 1%", "Priority Fees: Boosted"
            ],
            [
                ":cancel: Cancel Auto-Buy"
            ],
        ],
        thisMenuCode: MenuCode.ViewAutoBuy,
        backMenuCode: MenuCode.ListAutoBuys,
        includeRefresh: true
    }),

    [MenuCode.TSLMainMenu]: new handlers.MetaMenuHandler(MenuCode.TSLMainMenu, {
        text: ":chart_up:<b>Auto-Sell Positions</b>: Main Menu",
        buttons: [
            [
                { text: ":sparkle: New Auto-Sell :sparkle:", menuCode: MenuCode.NewPosition }
            ],
            [
                { text: ":chart_up: View Open Auto-Sell Positions", menuCode: MenuCode.ListPositions }
            ]
        ],
        thisMenuCode: MenuCode.TSLMainMenu,
        backMenuCode: MenuCode.Main
    }),

    [MenuCode.RegPosMainMenu]: new handlers.MetaMenuHandler(MenuCode.RegPosMainMenu, {
        text: "<b>Regular Positions</b>: Main Menu",
        buttons: [
            [
                { text: ":sparkle: New Regular Position :sparkle:", menuCode: MenuCode.NewRegularPosition }
            ],
            [
                { text: ":chart_up: View Open Regular Positions", menuCode: MenuCode.ListRegularPositions }
            ]
        ],
        thisMenuCode: MenuCode.RegPosMainMenu,
        backMenuCode: MenuCode.Main
    }),

    [MenuCode.AutoBuyMainMenu]: new handlers.MetaMenuHandler(MenuCode.AutoBuyMainMenu, {
        text: ":sparkle:<b>Auto-Buys</b>: Main Menu",
        buttons: [
            [
                { text: ":sparkle: Create New Auto-Buy :sparkle:", menuCode: MenuCode.NewAutoBuy }
            ],
            [
                { text: ":sparkle: View Active Auto-Buys", menuCode: MenuCode.ListAutoBuys }
            ]
        ],
        thisMenuCode: MenuCode.AutoBuyMainMenu,
        backMenuCode: MenuCode.Main
    }),

    [MenuCode.EngageReferrals]: new handlers.MetaMenuHandler(MenuCode.EngageReferrals, {
        text: [
            `${logoHack()}<b>My Referrals</b>`,
            "",
            "<b><u>Engage to Reduce Platform Fees!</u></b>",
            "Your platform fee will be reduced if more of your referrals use SolSentry this week.",
            "",
            "<i>Click a referral's name to send them a reminder to use SolSentry!</i>"
        ].join("\r\n"),
        buttons: [
            [":green: @kylealexpena [ACTIVE THIS WEEK]"],
            [":red: @somebodyelse [CLICK TO REMIND]"],
            [":red: @myotherfriend [CLICK TO REMIND]"],
        ],
        thisMenuCode: MenuCode.EngageReferrals,
        backMenuCode: MenuCode.Referrals,
        includeRefresh: true
    }),

    [MenuCode.GetReferralLink]: new handlers.MetaMenuHandler(MenuCode.GetReferralLink, {
        text: [
            "<b><u>Here is your one-time referral link to send to friends.</u></b>",
            "<i>Click to copy and send the link</i>",
            "",
            ":ticket:<code>https://t.me/solsentry?start=VW7XI23W</code>:ticket:",
            "",
            `${logoHack()}`
        ].join("\r\n"),
        buttons: [],
        thisMenuCode: MenuCode.GetReferralLink,
        backMenuCode: MenuCode.Referrals,
        includeRefresh: true
    }),

    [MenuCode.AutoBuyAutoSellMain]: new handlers.MetaMenuHandler(MenuCode.AutoBuyAutoSellMain, {
        text: ":sparkle:<b>Auto-Buy + Auto-Sell :chart_up: Positions</b>: Main Menu",
        buttons: [
            [
                { text: ":sparkle: New Auto-Buy + Auto-Sell Position :sparkle:", menuCode: MenuCode.NewAutoBuyAutoSell }
            ],
            [
                { text: ":chart_up: View Open Auto-Buy + Auto-Sell Positions", menuCode: MenuCode.ListAutoBuyAutoSell }
            ]
        ],
        thisMenuCode: MenuCode.AutoBuyAutoSellMain,
        backMenuCode: MenuCode.Main
    }),

    
    [MenuCode.NewAutoBuyAutoSell]: new handlers.MetaMenuHandler(MenuCode.NewAutoBuyAutoSell, {
        text: [
            `${WEN_LOGO}<u><b>Create New Auto-Buy + Auto-Sell Position</b></u>`,
            "(<code>WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk</code>)",
            "",
            "<b>Interpretation:</b>",
            ":bullet: <code>0.50</code> SOL of $WEN will be purchased when VOLUME decreases by 3% from latest peak",
            ":bullet: Then, all $WEN will be automatically sold when PRICE decreases by 5% from latest peak",
            "",
            "<i>Adjust your settings here.</i>"
        ].join("\r\n"),
        buttons: [
            [
                ":pencil: Change Token", ":dollars: 0.50 SOL"
            ],
            [
                "BUY:", "VOL :mountain:", ":down_arrow:", "3%"
            ],
            [
                "SELL:", "PRICE :mountain:", ":down_arrow:", "5%"
            ],
            [
                ":twisted_arrows: Slippage: 1%", "Priority Fees: Boosted"
            ],
            [
                ":sparkle: Create Auto-Buy + Auto-Sell Position :sparkle:"
            ],
        ],
        thisMenuCode: MenuCode.NewAutoBuyAutoSell,
        backMenuCode: MenuCode.AutoBuyAutoSellMain,
        includeRefresh: true
    }),


    [MenuCode.ListAutoBuyAutoSell]: new handlers.MetaMenuHandler(MenuCode.ListAutoBuyAutoSell, {
        text: "<u><b>Your :sparkle: Auto-Buy + Auto-Sell :chart_up: Positions</b></u>",
        buttons: [
            [ ":blue: 0.50 SOL :bullet: $WEN (Waiting To Buy)"],
            [ ":green: 0.10 SOL :bullet: $SLERF (Waiting To Sell)"],
        ],
        thisMenuCode: MenuCode.ListAutoBuyAutoSell,
        backMenuCode: MenuCode.AutoBuyAutoSellMain,
        includeRefresh: true
    }),
    [MenuCode.ViewAutoBuyAutoSell]: new handlers.NoOpHandler(MenuCode.ViewAutoBuyAutoSell)
}
