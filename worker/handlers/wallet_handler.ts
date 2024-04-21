import { DecimalizedAmount } from "../../decimalized";
import { getUserData } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class WalletHandler extends BaseMenuCodeHandler<MenuCode.Wallet> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.Wallet) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const userData = await getUserData(params.getTelegramUserID(), params.chatID, messageID, true, env);
        return new Menus.MenuWallet(userData, env);
    }
}
