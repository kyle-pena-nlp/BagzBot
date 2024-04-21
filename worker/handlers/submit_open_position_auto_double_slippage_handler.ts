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

export class SubmitOpenPositionAutoDoubleSlippageHandler extends BaseMenuCodeHandler<MenuCode.SubmitOpenPositionAutoDoubleSlippage> {
    constructor(menuCode : MenuCode.SubmitOpenPositionAutoDoubleSlippage) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const posIDAndChoice = PositionIDAndChoice.parse(callbackData.menuArg||'');
        if (posIDAndChoice == null) {
            return this.sorryError();
        }
        const posID = posIDAndChoice.positionID;
        const choice = posIDAndChoice.choice;
        await setSellAutoDoubleOnOpenPosition(params.getTelegramUserID(), params.chatID, posID, choice, env);
        return this.makeOpenPositionMenu(params,posID);
    }
}
