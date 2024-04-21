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

export class SubmitAdminDeletePositionByIDHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminDeletePositionByID> {
    constructor(menuCode : MenuCode.SubmitAdminDeletePositionByID) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const positionIDtoDelete = callbackData.menuArg||'';
        if (!isAdminOrSuperAdmin(params.getTelegramUserID('real'), env)) {
            return new Menus.MenuContinueMessage("You do not have permission to do that", MenuCode.Main, env);
        }
        const adminDeletePositionResponse = await adminDeletePositionByID(params.getTelegramUserID(), params.chatID, positionIDtoDelete, env);
        const adminDeletePositionByIDMsg = adminDeletePositionResponse.success ? `Position with ID ${positionIDtoDelete} was deleted` : `Position with ID ${positionIDtoDelete} could not be deleted (might already not exist)`;
        return new Menus.MenuContinueMessage(adminDeletePositionByIDMsg, MenuCode.Main, env);
    }
}
