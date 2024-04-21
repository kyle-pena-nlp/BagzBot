import { DecimalizedAmount } from "../../decimalized";
import { impersonateUser } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitImpersonateUserHandler extends BaseMenuCodeHandler<MenuCode.SubmitImpersonateUser> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitImpersonateUser) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const userIDToImpersonate = Util.tryParseInt(callbackData.menuArg||'');
        if (!userIDToImpersonate) {
            return new Menus.MenuContinueMessage(`Sorry, that can't be interpreted as a user ID: '${callbackData.menuArg||''}'`, MenuCode.Main, env);
        }
        await impersonateUser(params.getTelegramUserID('real'), params.chatID, userIDToImpersonate, env);
        params.impersonate(userIDToImpersonate, env);
        return this.createMainMenu(params, env);
    }
}
