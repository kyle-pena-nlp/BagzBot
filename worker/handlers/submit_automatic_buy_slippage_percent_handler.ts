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

export class SubmitQuickBuySlippagePctHandler extends BaseMenuCodeHandler<MenuCode.SubmitQuickBuySlippagePct> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitQuickBuySlippagePct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const choice = tryParseFloat(callbackData.menuArg||'');
        if (choice == null) {
            return new Menus.MenuContinueMessage(`Sorry - ${choice} is not a valid slippage percent.`, MenuCode.Settings, env);
        }
        if (choice <= 0 || choice > 100) {
            return new Menus.MenuContinueMessage(`Sorry - ${choice}% is not a valid slippage percent.`, MenuCode.Settings, env);
        }
        const changes : MakeAllPropsNullable<UserSettings> = {
            quickBuySlippagePct: choice
        };
        const setUserSettingsResponse = await setUserSettings(params.getTelegramUserID(), params.chatID, changes, env);
        return new Menus.MenuSettings(setUserSettingsResponse.userSettings, env);
    }
}