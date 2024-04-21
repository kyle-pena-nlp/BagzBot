import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class EditOpenPositionCustomSlippagePercentHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionCustomSlippagePercent> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.EditOpenPositionCustomSlippagePercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        return new ReplyQuestion('Enter a Slippage Percent', ReplyQuestionCode.OpenPositionCustomSlippagePercent, context, {
            callback: {
                linkedMessageID: params.messageID,
                nextMenuCode: MenuCode.EditOpenPositionSubmitCustomSlippagePercent,
                menuArg: callbackData.menuArg
            },
            timeoutMS: Util.strictParseInt(env.QUESTION_TIMEOUT_MS)
        });
    }
}
