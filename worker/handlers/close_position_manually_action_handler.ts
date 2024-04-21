import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ClosePositionManuallyActionHandler extends BaseMenuCodeHandler<MenuCode.ClosePositionManuallyAction> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ClosePositionManuallyAction) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const closePositionID = callbackData.menuArg;
        if (closePositionID != null) {
            await this.handleManuallyClosePosition(params.getTelegramUserID(), params.chatID, closePositionID, env);
        }
        return new Menus.MenuContinueMessage(`We are closing this position.  You will receive notifications below.`, MenuCode.ViewOpenPosition, env, 'HTML', closePositionID);
    }
}
