import { DecimalizedAmount } from "../../decimalized";
import { sendMessageToUser } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitAdminSendUserMessageHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminSendUserMessage> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitAdminSendUserMessage) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
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
