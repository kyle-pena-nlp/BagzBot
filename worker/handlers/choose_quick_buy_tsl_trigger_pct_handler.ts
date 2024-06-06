import { DecimalizedAmount } from "../../decimalized";
import { getUserSettings } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ChooseQuickBuyTSLTriggerPctHandler extends BaseMenuCodeHandler<MenuCode.ChooseQuickBuyTSLTriggerPercent> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ChooseQuickBuyTSLTriggerPercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const userSettings = await getUserSettings(params.getTelegramUserID(), params.chatID, env);
        const triggerPct = userSettings.userSettings.quickBuyTSLTriggerPct;
        const menuParams : Menus.ChooseTSLTriggerPercentMenuParams = {
            text: "",
            submitMenuCode: MenuCode.SubmitQuickBuyTSLTriggerPercent,
            backMenuCode: MenuCode.Settings,
            customTSLTriggerPercentMenuCode: MenuCode.CustomQuickBuyTSLTriggerPercent,
            defaultCustomTSLTriggerPercent: triggerPct
        };
        return new Menus.MenuChooseTSLTriggerPercent(menuParams, triggerPct, env);             
    }
}