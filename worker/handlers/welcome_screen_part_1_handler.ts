import { DecimalizedAmount } from "../../decimalized";
import { getUserData } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class WelcomeScreenPart1Handler extends BaseMenuCodeHandler<MenuCode.WelcomeScreenPart1> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.WelcomeScreenPart1) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        await this.touchUserDO(params, env);
        return new Menus.WelcomeScreenPart1(undefined, env);
    }
    private async touchUserDO(params : CallbackHandlerParams, env : Env) {
        // call out to the userDO once so that the wallet is ready for next request
        const userData = getUserData(params.getTelegramUserID(), params.chatID, params.messageID, true, env);
    }
}
