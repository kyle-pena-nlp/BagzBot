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

export class TrailingStopLossPickVsTokenMenuHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossPickVsTokenMenu> {
    constructor(menuCode : MenuCode.TrailingStopLossPickVsTokenMenu) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const trailingStopLossVsTokenNameAndAddress : TokenSymbolAndAddress = await this.getTrailingStopLossPositionVsTokenFromSession(params.getTelegramUserID(), params.chatID, messageID, env);
        return new Menus.MenuTrailingStopLossPickVsToken(trailingStopLossVsTokenNameAndAddress, env);
    }
}
