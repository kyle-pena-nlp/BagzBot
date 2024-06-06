import { DecimalizedAmount } from "../../decimalized";
import { UserSettings } from "../../durable_objects/user/model/user_settings";
import { setUserSettings } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { strictParseFloat, tryParseFloat } from "../../util";
import { MakeAllPropsNullable } from "../../util/builder_types";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitQuickBuySOLAmountHandler extends BaseMenuCodeHandler<MenuCode.SubmitQuickBuySOLAmount> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitQuickBuySOLAmount) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const choice = tryParseFloat(callbackData.menuArg||'');
        if (choice == null) {
            return new Menus.MenuContinueMessage(`Sorry - ${choice} is not a valid slippage percent.`, MenuCode.Settings, env);
        }
        const SOL_BUY_LIMIT = strictParseFloat(env.SOL_BUY_LIMIT);
        if (choice <= 0) {
            return new Menus.MenuContinueMessage(`Sorry - ${choice}% is not a valid slippage percent.`, MenuCode.Settings, env);
        }
        else if (choice > SOL_BUY_LIMIT) {
            return new Menus.MenuContinueMessage(`Sorry - ${choice}% exceeds ${env.TELEGRAM_BOT_DISPLAY_NAME}'s buy limit for SOL at this time.`, MenuCode.Settings, env);
        }
        const changes : MakeAllPropsNullable<UserSettings> = {
            quickBuySOLAmount: choice
        };
        const setUserSettingsResponse = await setUserSettings(params.getTelegramUserID(), params.chatID, changes, env);
        return new Menus.MenuSettings(setUserSettingsResponse.userSettings, env);
    }
}