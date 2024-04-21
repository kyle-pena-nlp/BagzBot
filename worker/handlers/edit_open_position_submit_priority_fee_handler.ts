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

export class EditOpenPositionSubmitPriorityFeeHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionSubmitPriorityFee> {
    constructor(menuCode : MenuCode.EditOpenPositionSubmitPriorityFee) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const thing = PositionIDAndPriorityFeeMultiplier.parse(callbackData.menuArg||'');
        if (thing == null) {
            return new Menus.MenuContinueMessage(`Sorry - that selection was not recognized as valid`, MenuCode.Main, env);
        }
        await setOpenPositionSellPriorityFeeMultiplier(params.getTelegramUserID(), params.chatID, thing.positionID, thing.multiplier, env);
        return await this.makeOpenPositionMenu(params, thing.positionID);
    }
}
