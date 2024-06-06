import { DecimalizedAmount } from "../../decimalized";
import { QuantityAndToken } from "../../durable_objects/user/model/quantity_and_token";
import { getUserSettings } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { BuyQuantityMenuParams } from "../../menus/menu_choose_buy_quantity";
import { ReplyQuestion } from "../../reply_question";
import { getVsTokenInfo } from "../../tokens";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ChooseQuickBuySOLAmountHandler extends BaseMenuCodeHandler<MenuCode.ChooseQuickBuySOLAmount> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ChooseQuickBuySOLAmount) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const menuParams : BuyQuantityMenuParams = {
            text: "",
            submitMenuCode: MenuCode.SubmitQuickBuySOLAmount,
            backMenuCode: MenuCode.Settings,
            customBuyQuantityMenuCode: MenuCode.CustomQuickBuySOLAmount
        };
        const userSettings = await getUserSettings(params.getTelegramUserID(), params.chatID, env);
        const quantityAndToken : QuantityAndToken = {
            quantity: userSettings.userSettings.quickBuySOLAmount,
            thisTokenAddress: getVsTokenInfo('SOL').address,
            thisTokenSymbol: getVsTokenInfo('SOL').symbol
        }
        return new Menus.MenuChooseBuyQuantity(menuParams, { quantityAndToken }, env);
    }
}