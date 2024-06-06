import { DecimalizedAmount } from "../../decimalized";
import { getUserSettings } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ChooseQuickBuySlippagePctHandler extends BaseMenuCodeHandler<MenuCode.ChooseQuickBuySlippagePct> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ChooseQuickBuySlippagePct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const userSettings = await getUserSettings(params.getTelegramUserID(), params.chatID, env);
        const slippagePct = userSettings.userSettings.quickBuySlippagePct;
        const menuParams : Menus.ChooseSlippagePctParams = {
            text: "",
            submitMenuCode: MenuCode.SubmitQuickBuySlippagePct,
            backMenuCode: MenuCode.Settings,
            chooseCustomSlippagePctMenuCode: MenuCode.CustomQuickBuySlippagePctAmount,
            defaultCustomSlippagePercent: slippagePct
        };
        return new Menus.MenuChooseSlippagePercent(menuParams, env);        
    }
}