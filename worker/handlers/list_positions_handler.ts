import { DecimalizedAmount } from "../../decimalized";
import { listPositionsFromUserDO } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ListPositionsHandler extends BaseMenuCodeHandler<MenuCode.ListPositions> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ListPositions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const positions = await listPositionsFromUserDO(params.getTelegramUserID(), params.chatID, env);
        return new Menus.MenuListPositions(positions, env);
    }
}
