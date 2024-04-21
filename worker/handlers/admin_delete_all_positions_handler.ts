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

export class AdminDeleteAllPositionsHandler extends BaseMenuCodeHandler<MenuCode.AdminDeleteAllPositions> {
    constructor(menuCode : MenuCode.AdminDeleteAllPositions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const deleteAllPositionsResponse = await adminDeleteAllPositions(params.getTelegramUserID(), params.chatID, params.getTelegramUserID('real'), env).catch(r => {
            logError(r);
            return null;
        });
        return new Menus.MenuContinueMessage(deleteAllPositionsResponse != null ? "Positions deleted" : "Error occurred", MenuCode.Main, env);
    }
}
