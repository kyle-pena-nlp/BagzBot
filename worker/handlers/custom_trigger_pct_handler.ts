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

export class CustomTriggerPctHandler extends BaseMenuCodeHandler<MenuCode.CustomTriggerPct> {
    constructor(menuCode : MenuCode.CustomTriggerPct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const triggerPctQuestion = new ReplyQuestion(
            "Enter a custom trigger percent",
            ReplyQuestionCode.EnterTriggerPercent,
            context,
            {
                callback : {
                    nextMenuCode: MenuCode.SubmitTriggerPct,
                    linkedMessageID: messageID
                },
                timeoutMS: Util.strictParseInt(this.env.QUESTION_TIMEOUT_MS)
            });
        return triggerPctQuestion;
    }
}
