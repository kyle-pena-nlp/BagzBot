import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class CustomTriggerPctHandler extends BaseMenuCodeHandler<MenuCode.CustomTSLPositionRequestTriggerPct> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.CustomTSLPositionRequestTriggerPct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const triggerPctQuestion = new ReplyQuestion(
            "Enter a custom trigger percent",
            ReplyQuestionCode.EnterTriggerPercent,
            context,
            {
                callback : {
                    nextMenuCode: MenuCode.SubmitTSLPositionRequestTriggerPct,
                    linkedMessageID: messageID
                },
                timeoutMS: Util.strictParseInt(env.QUESTION_TIMEOUT_MS)
            });
        return triggerPctQuestion;
    }
}
