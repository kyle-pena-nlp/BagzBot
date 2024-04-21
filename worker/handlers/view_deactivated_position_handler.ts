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

export class ViewDeactivatedPositionHandler extends BaseMenuCodeHandler<MenuCode.ViewDeactivatedPosition> {
    constructor(menuCode : MenuCode.ViewDeactivatedPosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const deactivatedPosition = await getDeactivatedPosition(params.getTelegramUserID(), params.chatID, callbackData.menuArg||'', env);
        if (deactivatedPosition == null) {
            return new Menus.MenuContinueMessage("Sorry - this position is no longer deactivated or was removed", MenuCode.ViewDeactivatedPositions, env);
        }
        else {
            return new Menus.MenuViewDeactivatedPosition(deactivatedPosition, env);
        }
    }
}
