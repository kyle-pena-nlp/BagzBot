import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ChooseQuickBuyEnabledHandler extends BaseMenuCodeHandler<MenuCode.ChooseQuickBuyEnabled> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ChooseQuickBuyEnabled) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const menuParams : Menus.PickOneParams = {
            text: "Choose whether to enable Quick TSL Buys (buy JUST by sending this bot a token address or birdeye link)",
            options : [
                { text: "Yes", menuArg: "true" },
                { text: "No", menuArg: "false" }
            ],
            submitMenuCode: MenuCode.SubmitQuickBuyEnabled,
            backMenuCode: MenuCode.Settings,
            orientation: 'vertical'
        };
        return new Menus.MenuPickOne(menuParams, env);        
    }
}