import { DecimalizedAmount } from "../../decimalized";
import { UserSettings } from "../../durable_objects/user/model/user_settings";
import { setUserSettings } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { tryParseFloat } from "../../util";
import { MakeAllPropsNullable } from "../../util/builder_types";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitQuickBuyPriorityFeeHandler extends BaseMenuCodeHandler<MenuCode.SubmitQuickBuyPriorityFee> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitQuickBuyPriorityFee) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const menuArg = (callbackData.menuArg||'').trim();
        const changes : MakeAllPropsNullable<UserSettings>|undefined = this.maybeGetChanges(menuArg);
        if (changes == null) {
            return new Menus.MenuContinueMessage(`Sorry - there was a problem setting this option.s`, MenuCode.Settings, env);
        }
        const setUserSettingsResponse = await setUserSettings(params.getTelegramUserID(), params.chatID, changes, env);
        return new Menus.MenuSettings(setUserSettingsResponse.userSettings, env);
    }

    private maybeGetChanges(menuArg : string) : MakeAllPropsNullable<UserSettings>|undefined {
        if (menuArg === 'auto') {
            return {
                quickBuyPriorityFee: menuArg
            };
        }
        else {
            const parsed = tryParseFloat(menuArg);
            if (parsed != null) {
                return {
                    quickBuyPriorityFee: parsed
                };
            }
        }
    }
}