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

export class ClosePositionManuallyActionHandler extends BaseMenuCodeHandler<MenuCode.ClosePositionManuallyAction> {
    constructor(menuCode : MenuCode.ClosePositionManuallyAction) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const closePositionID = callbackData.menuArg;
        if (closePositionID != null) {
            await this.handleManuallyClosePosition(params.getTelegramUserID(), params.chatID, closePositionID, env);
        }
        return new Menus.MenuContinueMessage(`We are closing this position.  You will receive notifications below.`, MenuCode.ViewOpenPosition, env, 'HTML', closePositionID);
    }
}
