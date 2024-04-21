import { DecimalizedAmount } from "../../decimalized";
import { unimpersonateUser } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class UnimpersonateUserHandler extends BaseMenuCodeHandler<MenuCode.UnimpersonateUser> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.UnimpersonateUser) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        // should already be done by worker, but just in case.
        await unimpersonateUser(params.getTelegramUserID('real'), params.chatID, env);
        params.unimpersonate(env);
        return this.createMainMenu(params, env);
    }
}
