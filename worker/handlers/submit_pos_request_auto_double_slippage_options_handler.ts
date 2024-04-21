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

export class SubmitPosRequestAutoDoubleSlippageOptionsHandler extends BaseMenuCodeHandler<MenuCode.SubmitPosRequestAutoDoubleSlippageOptions> {
    constructor(menuCode : MenuCode.SubmitPosRequestAutoDoubleSlippageOptions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const opAutoDoubleSlippage = Util.tryParseBoolean((callbackData.menuArg||'').trim());
        if (opAutoDoubleSlippage == null) {
            return this.sorryError();
        }
        else {
            const x = await readSessionObj<PositionRequest>(
                params.getTelegramUserID(),
                params.chatID,
                params.messageID,
                POSITION_REQUEST_STORAGE_KEY,
                env);
            await storeSessionObjProperty<PositionRequest>(params.getTelegramUserID(),
                params.chatID,
                params.messageID,
                "sellAutoDoubleSlippage",
                opAutoDoubleSlippage,
                POSITION_REQUEST_STORAGE_KEY,
                env);
            const pr = await readSessionObj<PositionRequest>(
                params.getTelegramUserID(),
                params.chatID,
                params.messageID,
                POSITION_REQUEST_STORAGE_KEY,
                env);
            return new Menus.MenuEditPositionRequest({ positionRequest: pr, maybeSOLBalance }, env);
        }
    }
}
