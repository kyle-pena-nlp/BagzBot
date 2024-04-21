import { DecimalizedAmount } from "../../decimalized";
import { TokenSymbolAndAddress } from "../../durable_objects/user/model/token_name_and_address";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class TrailingStopLossPickVsTokenMenuHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossPickVsTokenMenu> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.TrailingStopLossPickVsTokenMenu) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const trailingStopLossVsTokenNameAndAddress : TokenSymbolAndAddress = await this.getTrailingStopLossPositionVsTokenFromSession(params.getTelegramUserID(), params.chatID, messageID, env);
        return new Menus.MenuTrailingStopLossPickVsToken(trailingStopLossVsTokenNameAndAddress, env);
    }
}
