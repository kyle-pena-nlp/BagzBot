import { DecimalizedAmount } from "../../decimalized";
import { adminDeleteAllPositions } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { logError } from "../../logging";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class AdminDeleteAllPositionsHandler extends BaseMenuCodeHandler<MenuCode.AdminDeleteAllPositions> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminDeleteAllPositions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const deleteAllPositionsResponse = await adminDeleteAllPositions(params.getTelegramUserID(), params.chatID, params.getTelegramUserID('real'), env).catch(r => {
            logError(r);
            return null;
        });
        return new Menus.MenuContinueMessage(deleteAllPositionsResponse != null ? "Positions deleted" : "Error occurred", MenuCode.Main, env);
    }
}
