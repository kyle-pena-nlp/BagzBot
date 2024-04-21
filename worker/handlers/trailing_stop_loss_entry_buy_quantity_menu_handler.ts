import { DecimalizedAmount } from "../../decimalized";
import { QuantityAndToken } from "../../durable_objects/user/model/quantity_and_token";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class TrailingStopLossEntryBuyQuantityMenuHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossEntryBuyQuantityMenu> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.TrailingStopLossEntryBuyQuantityMenu) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const quantityAndTokenForBuyQuantityMenu : QuantityAndToken = await this.getTrailingStopLossPositionQuantityAndVsTokenFromSession(params.getTelegramUserID(), params.chatID, messageID, env);
        return new Menus.MenuTrailingStopLossEntryBuyQuantity({ quantityAndToken: quantityAndTokenForBuyQuantityMenu }, env);
    }
}
