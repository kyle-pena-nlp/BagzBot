import { DecimalizedAmount } from "../../decimalized";
import { adminDeleteClosedPositions } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class AdminDeleteClosedPositionsHandler extends BaseMenuCodeHandler<MenuCode.AdminDeleteClosedPositions> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminDeleteClosedPositions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        await adminDeleteClosedPositions(params.getTelegramUserID(), params.chatID, env);
        return await this.createMainMenu(params, env);
    }
}
