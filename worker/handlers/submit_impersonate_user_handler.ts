import * as Menus from "../../menus";
import * as Util from "../../util";
import { BaseMenuCodeHandler } from "./base_menu_code_handler";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { TGStatusMessage, TGMessageChannel } from "../../telegram";
import { logError, logDebug, logInfo } from "../../logging";
import { readSessionObj, storeSessionObj, storeSessionObjProperty } from "../../durable_objects/user/userDO_interop";

export class SubmitImpersonateUserHandler extends BaseMenuCodeHandler<MenuCode.SubmitImpersonateUser> {
    constructor(menuCode : MenuCode.SubmitImpersonateUser) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
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
