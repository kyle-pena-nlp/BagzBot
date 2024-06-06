import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ChooseQuickBuySlippagePctHandler extends BaseMenuCodeHandler<MenuCode.ChooseQuickBuySlippagePct> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ChooseQuickBuySlippagePct) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        
    }
}