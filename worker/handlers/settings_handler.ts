import { DecimalizedAmount } from "../../decimalized";
import { getUserSettings } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { BaseMenu, MenuCode, MenuSettings } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SettingsHandler extends BaseMenuCodeHandler<MenuCode.Settings> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.Settings) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const settings = await getUserSettings(params.getTelegramUserID(), params.chatID, env);
        return new MenuSettings(settings.userSettings, env);
    }
}
