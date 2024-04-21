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

export class SubmitAdminInvokeAlarmHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminInvokeAlarm> {
    constructor(menuCode : MenuCode.SubmitAdminInvokeAlarm) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const ti = await getTokenInfo(callbackData.menuArg||'',env);
        if (isValidTokenInfoResponse(ti)) {
            await adminInvokeAlarm(callbackData.menuArg||'', getVsTokenInfo('SOL').address, env);
            return new Menus.MenuContinueMessage('Alarm invoked', MenuCode.Main, env);
        }
        else {
            return new Menus.MenuContinueMessage('Not a token', MenuCode.Main, env);
        }
    }
}
