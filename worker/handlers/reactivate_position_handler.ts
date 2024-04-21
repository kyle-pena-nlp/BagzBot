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

export class ReactivatePositionHandler extends BaseMenuCodeHandler<MenuCode.ReactivatePosition> {
    constructor(menuCode : MenuCode.ReactivatePosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const reactivatePositionResponse = await reactivatePosition(params.getTelegramUserID(), params.chatID, callbackData.menuArg||'', env);
        if (reactivatePositionResponse.success) {
            return new Menus.MenuContinueMessage("This position will now be price monitored", MenuCode.ListPositions, env);
        }
        else {
            return new Menus.MenuContinueMessage("This position could not be activated", MenuCode.ViewDeactivatedPosition, env, 'HTML', callbackData.menuArg);
        }
    }
}
