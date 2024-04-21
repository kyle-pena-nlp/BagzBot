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

export class TrailingStopLossPickVsTokenMenuSubmitHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossPickVsTokenMenuSubmit> {
    constructor(menuCode : MenuCode.TrailingStopLossPickVsTokenMenuSubmit) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const messageID = params.messageID;
        const trailingStopLossSelectedVsToken = callbackData.menuArg!!;
        const vsTokenAddress = getVsTokenInfo(trailingStopLossSelectedVsToken).address;
        const vsToken = getVsTokenInfo(trailingStopLossSelectedVsToken);
        await storeSessionValues(params.getTelegramUserID(), params.chatID, messageID, new Map<string,Structural>([
            ["vsToken", vsToken],
            //["vsTokenAddress", vsTokenAddress]
        ]), POSITION_REQUEST_STORAGE_KEY, env);
        const trailingStopLossPositionRequestAfterSubmittingVsToken = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return await this.makeStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterSubmittingVsToken, maybeSOLBalance, env);
    }
}
