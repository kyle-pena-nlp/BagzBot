import { DecimalizedAmount } from "../../decimalized";
import { adminResetDefaultPositionRequest } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class AdminResetPositionRequestDefaultsHandler extends BaseMenuCodeHandler<MenuCode.AdminResetPositionRequestDefaults> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminResetPositionRequestDefaults) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        await adminResetDefaultPositionRequest(params.getTelegramUserID(), params.chatID, env);
        return await this.createMainMenu(params, env);
    }
}
