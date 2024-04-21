import { DecimalizedAmount } from "../../decimalized";
import { getPositionFromUserDO } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ViewOpenPositionHandler extends BaseMenuCodeHandler<MenuCode.ViewOpenPosition> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ViewOpenPosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const viewPositionID = callbackData.menuArg!!;
        const positionAndMaybePNL = await getPositionFromUserDO(params.getTelegramUserID(), params.chatID, viewPositionID, env);
        if (positionAndMaybePNL == null) {
            return new Menus.MenuContinueMessage('Sorry - this position is no longer being price monitored!', MenuCode.Main, env);
        }
        return new Menus.MenuViewOpenPosition({ data: positionAndMaybePNL }, env);
    }
}
