import { DecimalizedAmount } from "../../decimalized";
import { reactivatePosition } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ReactivatePositionHandler extends BaseMenuCodeHandler<MenuCode.ReactivatePosition> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ReactivatePosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const reactivatePositionResponse = await reactivatePosition(params.getTelegramUserID(), params.chatID, callbackData.menuArg||'', env);
        if (reactivatePositionResponse.success) {
            return new Menus.MenuContinueMessage("This position will now be price monitored", MenuCode.ListPositions, env);
        }
        else {
            return new Menus.MenuContinueMessage("This position could not be activated", MenuCode.ViewDeactivatedPosition, env, 'HTML', callbackData.menuArg);
        }
    }
}
