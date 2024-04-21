import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class BetaFeedbackQuestionHandler extends BaseMenuCodeHandler<MenuCode.BetaFeedbackQuestion> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.BetaFeedbackQuestion) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        return new ReplyQuestion(
            "Enter your feedback - it will be reviewed by the administrators",
            ReplyQuestionCode.SendBetaFeedback,
            context, {
                callback: {
                    linkedMessageID: messageID,
                    nextMenuCode: MenuCode.SubmitBetaFeedback
                },
                timeoutMS: 45000
            });
    }
}
