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

export class EditOpenPositionSubmitCustomSlippagePercentHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionSubmitCustomSlippagePercent> {
    constructor(menuCode : MenuCode.EditOpenPositionSubmitCustomSlippagePercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const positionIDAndSlippagePercent = PositionIDAndSellSlippagePercent.gracefulParse(callbackData.menuArg||'');
        if (positionIDAndSlippagePercent == null) {
            return new Menus.MenuContinueMessage('Sorry - that was an unexpected problem', MenuCode.Main, env);
        }
        if ('sellSlippagePercent' in positionIDAndSlippagePercent && positionIDAndSlippagePercent.sellSlippagePercent > 0 && positionIDAndSlippagePercent.sellSlippagePercent < 100) {
            await setSellSlippagePercentOnOpenPosition(params.getTelegramUserID(), params.chatID, positionIDAndSlippagePercent.positionID, positionIDAndSlippagePercent.sellSlippagePercent, env);
            return await this.makeOpenPositionMenu(params, positionIDAndSlippagePercent.positionID);
        }
        else {
            return new Menus.MenuContinueMessage('Sorry - that was an invalid percentage', MenuCode.ViewOpenPosition, env, 'HTML', positionIDAndSlippagePercent.positionID);
        }
    }
}
