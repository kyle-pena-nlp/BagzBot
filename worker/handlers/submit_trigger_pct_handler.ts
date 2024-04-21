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

export class SubmitTriggerPctHandler extends BaseMenuCodeHandler<MenuCode.SubmitTriggerPct> {
    constructor(menuCode : MenuCode.SubmitTriggerPct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const messageID = params.messageID;
        const triggerPctEntry = Util.tryParseFloat(callbackData.menuArg!!);
        if (!triggerPctEntry || triggerPctEntry < 0 || triggerPctEntry >= 100) {
            return new Menus.MenuContinueMessage(
                `Sorry - '${callbackData.menuArg||''}' is not a valid percentage`,
                MenuCode.TrailingStopLossTriggerPercentMenu, env);
        }
        await storeSessionObjProperty<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, "triggerPercent", triggerPctEntry, POSITION_REQUEST_STORAGE_KEY, env);
        const updatedTSL = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return await this.makeStopLossRequestEditorMenu(updatedTSL, maybeSOLBalance, env);
    }
}
