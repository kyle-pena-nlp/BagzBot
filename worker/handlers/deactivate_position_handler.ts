import { DecimalizedAmount } from "../../decimalized";
import { deactivatePosition } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class DeactivatePositionHandler extends BaseMenuCodeHandler<MenuCode.DeactivatePosition> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.DeactivatePosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const deactivatePositionResponse = await deactivatePosition(params.getTelegramUserID(), params.chatID, callbackData.menuArg||'', env);
        if (deactivatePositionResponse.success) {
            return new Menus.MenuContinueMessage("This position has been deactivated and will no longer be price monitored", MenuCode.ViewDeactivatedPositions, env);
        }
        else {
            return new Menus.MenuContinueMessage("This position could not be deactivated", MenuCode.ViewOpenPosition, env, 'HTML', callbackData.menuArg);
        }
    }
}
