import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitBetaFeedbackHandler extends BaseMenuCodeHandler<MenuCode.SubmitBetaFeedback> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitBetaFeedback) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const betaFeedbackAnswer = (callbackData.menuArg||'').trim();
        if (betaFeedbackAnswer !== '') {
            context.waitUntil(this.sendBetaFeedbackToSuperAdmin(betaFeedbackAnswer, params.getTelegramUserName(), params.getTelegramUserID(), env));
        }
        await new Menus.MenuOKClose("Thank you!", env).sendToTG({ chatID : params.chatID }, env);
        return;
    }
}
