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

export class AdminDeletePositionByIDHandler extends BaseMenuCodeHandler<MenuCode.AdminDeletePositionByID> {
    constructor(menuCode : MenuCode.AdminDeletePositionByID) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        return new ReplyQuestion('Enter position ID to delete', ReplyQuestionCode.AdminDeletePositionByID, context, {
            callback: {
                linkedMessageID: params.messageID,
                nextMenuCode: MenuCode.SubmitAdminDeletePositionByID
            },
            timeoutMS: 60000
        });
    }
}
