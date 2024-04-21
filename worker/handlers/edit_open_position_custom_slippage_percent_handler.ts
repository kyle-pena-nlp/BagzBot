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

export class EditOpenPositionCustomSlippagePercentHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionCustomSlippagePercent> {
    constructor(menuCode : MenuCode.EditOpenPositionCustomSlippagePercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        return new ReplyQuestion('Enter a Slippage Percent', ReplyQuestionCode.OpenPositionCustomSlippagePercent, context, {
            callback: {
                linkedMessageID: params.messageID,
                nextMenuCode: MenuCode.EditOpenPositionSubmitCustomSlippagePercent,
                menuArg: callbackData.menuArg
            },
            timeoutMS: Util.strictParseInt(this.env.QUESTION_TIMEOUT_MS)
        });
    }
}
