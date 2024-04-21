import { DecimalizedAmount } from "../../decimalized";
import { getDeactivatedPosition } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ViewDeactivatedPositionHandler extends BaseMenuCodeHandler<MenuCode.ViewDeactivatedPosition> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ViewDeactivatedPosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const deactivatedPosition = await getDeactivatedPosition(params.getTelegramUserID(), params.chatID, callbackData.menuArg||'', env);
        if (deactivatedPosition == null) {
            return new Menus.MenuContinueMessage("Sorry - this position is no longer deactivated or was removed", MenuCode.ViewDeactivatedPositions, env);
        }
        else {
            return new Menus.MenuViewDeactivatedPosition(deactivatedPosition, env);
        }
    }
}
