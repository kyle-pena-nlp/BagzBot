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

export class SubmitBetaFeedbackHandler extends BaseMenuCodeHandler<MenuCode.SubmitBetaFeedback> {
    constructor(menuCode : MenuCode.SubmitBetaFeedback) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const betaFeedbackAnswer = (callbackData.menuArg||'').trim();
        if (betaFeedbackAnswer !== '') {
            context.waitUntil(this.sendBetaFeedbackToSuperAdmin(betaFeedbackAnswer, params.getTelegramUserName(), params.getTelegramUserID()));
        }
        await new Menus.MenuOKClose("Thank you!", env).sendToTG({ chatID }, env);
        return;
    }
}
