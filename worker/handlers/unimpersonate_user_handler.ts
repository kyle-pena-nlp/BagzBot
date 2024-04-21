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

export class UnimpersonateUserHandler extends BaseMenuCodeHandler<MenuCode.UnimpersonateUser> {
    constructor(menuCode : MenuCode.UnimpersonateUser) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        // should already be done by worker, but just in case.
        await unimpersonateUser(params.getTelegramUserID('real'), params.chatID, env);
        params.unimpersonate(env);
        return this.createMainMenu(params, env);
    }
}
