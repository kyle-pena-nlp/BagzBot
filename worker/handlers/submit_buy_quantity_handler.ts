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

export class SubmitBuyQuantityHandler extends BaseMenuCodeHandler<MenuCode.SubmitBuyQuantity> {
    constructor(menuCode : MenuCode.SubmitBuyQuantity) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const messageID = params.messageID;
        const submittedBuyQuantity = Util.tryParseFloat(callbackData.menuArg!!);
        if (!submittedBuyQuantity || submittedBuyQuantity <= 0.0) {
            return new Menus.MenuContinueMessage(`Sorry - '${callbackData.menuArg||''}' is not a valid quantity of SOL to buy.`, MenuCode.ReturnToPositionRequestEditor, env);
        }
        if (submittedBuyQuantity > Util.strictParseFloat(env.SOL_BUY_LIMIT)) {
            return new Menus.MenuContinueMessage(`Sorry - ${env.TELEGRAM_BOT_DISPLAY_NAME} does not currently allow purchases of over ${Util.strictParseFloat(env.SOL_BUY_LIMIT)} SOL`, MenuCode.ReturnToPositionRequestEditor, env);
        }
        await storeSessionObjProperty<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, "vsTokenAmt", submittedBuyQuantity, POSITION_REQUEST_STORAGE_KEY, env);
        const trailingStopLossRequestStateAfterBuyQuantityEdited = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return await this.makeStopLossRequestEditorMenu(trailingStopLossRequestStateAfterBuyQuantityEdited, maybeSOLBalance, env);
    }
}
