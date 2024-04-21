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

export class ViewOpenPositionHandler extends BaseMenuCodeHandler<MenuCode.ViewOpenPosition> {
    constructor(menuCode : MenuCode.ViewOpenPosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const viewPositionID = callbackData.menuArg!!;
        const positionAndMaybePNL = await getPositionFromUserDO(params.getTelegramUserID(), params.chatID, viewPositionID, env);
        if (positionAndMaybePNL == null) {
            return new Menus.MenuContinueMessage('Sorry - this position is no longer being price monitored!', MenuCode.Main, env);
        }
        return new Menus.MenuViewOpenPosition({ data: positionAndMaybePNL }, env);
    }
}
