import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class CustomSlippagePctHandler extends BaseMenuCodeHandler<MenuCode.CustomSlippagePct> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.CustomSlippagePct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const slippagePercentQuestion = new ReplyQuestion(
            "Enter the desired slippage percent",
            ReplyQuestionCode.EnterSlippagePercent,
            context,
            {
                callback:
                {
                    nextMenuCode: MenuCode.SubmitSlippagePct,
                    linkedMessageID: messageID
                },
                timeoutMS: Util.strictParseInt(env.QUESTION_TIMEOUT_MS)
            });
        return slippagePercentQuestion;
    }
}
