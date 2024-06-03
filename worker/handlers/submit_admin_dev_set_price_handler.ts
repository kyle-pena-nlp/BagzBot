import { DecimalizedAmount, fromNumber } from "../../decimalized";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitAdminDevSetPriceHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminDevSetPrice> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitAdminDevSetPrice) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const setPriceTokens = (callbackData.menuArg||'').split("/");
        if (setPriceTokens.length !== 3) {
            return new Menus.MenuContinueMessage("Not in correct format", MenuCode.Main, env);
        }
        const [tA,vTA,priceString] = setPriceTokens;
        const manuallyRevisedPrice = Util.tryParseFloat(priceString);
        if (manuallyRevisedPrice == null) {
            return new Menus.MenuContinueMessage(`Not a valid float: ${priceString}`, MenuCode.Main, env);
        }
        const decimalizedPrice = fromNumber(manuallyRevisedPrice);
        const result = null; 
        /*await _devOnlyFeatureUpdatePrice(params.getTelegramUserID(),tA,vTA,decimalizedPrice,env).catch(r => {
            return null;
        });*/
        if (result == null) {
            return new Menus.MenuContinueMessage(`Failure occurred when trying to update price of pair  ${tA}/${vTA} to ${manuallyRevisedPrice}`, MenuCode.Main, env);
        }
        return new Menus.MenuContinueMessage(`Price of pair ${tA}/${vTA} updated to ${manuallyRevisedPrice}`, MenuCode.Main, env)
    }
}
