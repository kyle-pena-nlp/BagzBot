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

export class SubmitOpenPositionSellSlippagePercentHandler extends BaseMenuCodeHandler<MenuCode.SubmitOpenPositionSellSlippagePercent> {
    constructor(menuCode : MenuCode.SubmitOpenPositionSellSlippagePercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const positionIDAndSellSlippagePercent = PositionIDAndSellSlippagePercent.parse(callbackData.menuArg||'');
        if (positionIDAndSellSlippagePercent == null) {
            return this.sorryError();
        }
        const updatedPosition = await setSellSlippagePercentOnOpenPosition(params.getTelegramUserID(), params.chatID, positionIDAndSellSlippagePercent.positionID, positionIDAndSellSlippagePercent.sellSlippagePercent, env);
        if (updatedPosition.positionAndMaybePNL == null) {
            return this.sorryError();
        }
        return new Menus.MenuViewOpenPosition({ data: updatedPosition.positionAndMaybePNL }, env);
    }
}
