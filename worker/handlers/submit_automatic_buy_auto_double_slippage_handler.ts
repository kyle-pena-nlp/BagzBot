import { DecimalizedAmount } from "../../decimalized";
import { UserSettings } from "../../durable_objects/user/model/user_settings";
import { setUserSettings } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { tryParseBoolean } from "../../util";
import { MakeAllPropsNullable } from "../../util/builder_types";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitQuickBuyAutoDoubleSlippageHandler extends BaseMenuCodeHandler<MenuCode.SubmitQuickBuyAutoDoubleSlippage> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitQuickBuyAutoDoubleSlippage) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const choice = tryParseBoolean(callbackData.menuArg||'');
        if (choice == null) {
            return new Menus.MenuContinueMessage("Sorry - there was an error setting this option", MenuCode.Settings, env);
        }
        const changes : MakeAllPropsNullable<UserSettings> = {
            quickBuyAutoDoubleSlippage: choice
        };
        const setUserSettingsResponse = await setUserSettings(params.getTelegramUserID(), params.chatID, changes, env);
        return new Menus.MenuSettings(setUserSettingsResponse.userSettings, env);
    }
}