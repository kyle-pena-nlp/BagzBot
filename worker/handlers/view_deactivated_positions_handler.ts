import { DecimalizedAmount } from "../../decimalized";
import { listDeactivatedPositions } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ViewDeactivatedPositionsHandler extends BaseMenuCodeHandler<MenuCode.ViewDeactivatedPositions> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ViewDeactivatedPositions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const listDeactivatedPositionsResponse = await listDeactivatedPositions(params.getTelegramUserID(), params.chatID, env);
        return new Menus.MenuViewDeactivatedPositions(listDeactivatedPositionsResponse.deactivatedPositions, env);
    }
}
