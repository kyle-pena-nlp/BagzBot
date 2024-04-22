import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ImpersonateUserHandler extends BaseMenuCodeHandler<MenuCode.ImpersonateUser> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ImpersonateUser) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const replyQuestion = new ReplyQuestion("Enter the user ID to begin user support for: ",
            ReplyQuestionCode.ImpersonateUser,
            context,
            {
                callback: {
                    linkedMessageID: messageID,
                    nextMenuCode: MenuCode.SubmitImpersonateUser
                }
            });
        return replyQuestion;
    }
}