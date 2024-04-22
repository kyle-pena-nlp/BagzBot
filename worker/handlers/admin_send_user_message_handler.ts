import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class AdminSendUserMessageHandler extends BaseMenuCodeHandler<MenuCode.AdminSendUserMessage> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminSendUserMessage) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        return new ReplyQuestion("Enter userID|message", ReplyQuestionCode.AdminSendUserMessage, context, {
            callback: {
                linkedMessageID: params.messageID,
                nextMenuCode: MenuCode.SubmitAdminSendUserMessage
            },
            timeoutMS: 60000
        });
    }
}