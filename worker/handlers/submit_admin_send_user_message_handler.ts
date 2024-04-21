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

export class SubmitAdminSendUserMessageHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminSendUserMessage> {
    constructor(menuCode : MenuCode.SubmitAdminSendUserMessage) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const tokens = (callbackData.menuArg||'').split("|");
        const recepientUserID = Util.tryParseInt(tokens[0]||'');
        const message = tokens[1]||'';
        if (recepientUserID != null && message != null) {
            await sendMessageToUser(recepientUserID, env.TELEGRAM_BOT_DISPLAY_NAME, params.getTelegramUserID(), message, env);
            await new Menus.MenuOKClose(`Message sent.`, env).sendToTG({ chatID : params.chatID }, env);
        }
        else {
            await new Menus.MenuOKClose(`Couldn't send message - incorrect format.`, env).sendToTG({ chatID : params.chatID }, env);
        }
        return;
    }
}
