import { DecimalizedAmount } from "../../decimalized";
import { readSessionObj, storeSessionObjProperty } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitSlippagePctHandler extends BaseMenuCodeHandler<MenuCode.SubmitSlippagePct> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitSlippagePct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const messageID = params.messageID;
        const slipPctEntry = Util.tryParseFloat(callbackData.menuArg||'');
        if (!slipPctEntry || slipPctEntry <= 0.0) {
            return new Menus.MenuContinueMessage(`Sorry - '${callbackData.menuArg||''}' is not a valid percentage.`, MenuCode.TrailingStopLossSlippagePctMenu, env);
        }
        if (slipPctEntry) {
            await storeSessionObjProperty<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, "slippagePercent", slipPctEntry, POSITION_REQUEST_STORAGE_KEY, env);
        }
        const positionRequestAfterEditingSlippagePct = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return await this.makeStopLossRequestEditorMenu(positionRequestAfterEditingSlippagePct, maybeSOLBalance, env);
    }
}
