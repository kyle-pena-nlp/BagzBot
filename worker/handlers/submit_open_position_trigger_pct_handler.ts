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

export class SubmitOpenPositionTriggerPctHandler extends BaseMenuCodeHandler<MenuCode.SubmitOpenPositionTriggerPct> {
    constructor(menuCode : MenuCode.SubmitOpenPositionTriggerPct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const parsedCallbackData = SubmittedTriggerPctKey.parse(callbackData.menuArg||'');
        if (parsedCallbackData == null) {
            return new Menus.MenuContinueMessage("Sorry - did not interpret this input", MenuCode.ListPositions, env);
        }
        const positionToEditID = parsedCallbackData.positionID;
        const editTriggerPercentResult = await editTriggerPercentOnOpenPositionFromUserDO(params.getTelegramUserID(), params.chatID, positionToEditID, parsedCallbackData.percent, env).catch(r => {
            logError(r);
            return null;
        });
        if (editTriggerPercentResult == null) {
            return new Menus.MenuContinueMessage(`Sorry - there was a problem editing the trigger percent`, MenuCode.ListPositions, env);
        }
        else if (editTriggerPercentResult === 'is-closing') {
            return new Menus.MenuContinueMessage(`Sorry - this position can no longer be edited because it is being sold`, MenuCode.ViewOpenPosition, env,  'HTML', parsedCallbackData.positionID);
        }
        else if (editTriggerPercentResult === 'is-closed') {
            return new Menus.MenuContinueMessage(`Sorry - this position can no longer be edited because it is has been sold`, MenuCode.ViewOpenPosition, env, 'HTML', parsedCallbackData.positionID);
        }
        else if (editTriggerPercentResult === 'position-DNE') {
            return new Menus.MenuContinueMessage(`Sorry - this position can no longer be edited because it is has been sold or does not exist`, MenuCode.ViewOpenPosition, env, 'HTML', parsedCallbackData.positionID);
        }
        else if (editTriggerPercentResult === 'invalid-percent') {
            return new Menus.MenuContinueMessage(`Sorry - please choose a percent greater than zero and less than 100`, MenuCode.ViewOpenPosition, env, 'HTML', parsedCallbackData.positionID);
        }
        else {
            return new Menus.MenuViewOpenPosition( { data: editTriggerPercentResult }, env);
        }
    }
}
