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

export class TrailingStopLossEditorFinalSubmitHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossEditorFinalSubmit> {
    constructor(menuCode : MenuCode.TrailingStopLossEditorFinalSubmit) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        // TODO: do the read within UserDO to avoid the extra roundtrip
        const positionRequestAfterFinalSubmit = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        const positionRequestRequest : OpenPositionRequest = {
            chatID: chatID,
            telegramUserID: params.getTelegramUserID(),
            positionRequest: positionRequestAfterFinalSubmit
        };
        await requestNewPosition(params.getTelegramUserID(), positionRequestRequest, env);
        return;
    }
}
