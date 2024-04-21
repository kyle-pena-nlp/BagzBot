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

export class AdminViewClosedPositionHandler extends BaseMenuCodeHandler<MenuCode.AdminViewClosedPosition> {
    constructor(menuCode : MenuCode.AdminViewClosedPosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const closedPositions = (await getClosedPositionsAndPNLSummary(params.getTelegramUserID(), params.chatID, env)).closedPositions;
        const closedPosition = closedPositions.filter(p => p.positionID === callbackData.menuArg||'')[0];
        return new Menus.MenuViewObj({ data: closedPosition, isAdmin: isAdminOrSuperAdmin(params.getTelegramUserID('real'), env)}, env);
    }
}
