import * as Menus from "../../menus";
import * as Util from "../../util";
import { BaseMenuCodeHandler } from "./base_menu_code_handler";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { TGStatusMessage, TGMessageChannel } from "../../telegram";
import { logError, logDebug, logInfo } from "../../logging";
import { readSessionObj, storeSessionObj, storeSessionObjProperty } from "../../durable_objects/user/userDO_interop";

export class SubmitAdminDevSetPriceHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminDevSetPrice> {
    constructor(menuCode : MenuCode.SubmitAdminDevSetPrice) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
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
        const result = await _devOnlyFeatureUpdatePrice(params.getTelegramUserID(),tA,vTA,decimalizedPrice,env).catch(r => {
            return null;
        });
        if (result == null) {
            return new Menus.MenuContinueMessage(`Failure occurred when trying to update price of pair  ${tA}/${vTA} to ${manuallyRevisedPrice}`, MenuCode.Main, env);
        }
        return new Menus.MenuContinueMessage(`Price of pair ${tA}/${vTA} updated to ${manuallyRevisedPrice}`, MenuCode.Main, env)
    }
}
