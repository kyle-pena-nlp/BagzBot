import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class EditOpenPositionAutoDoubleSlippageHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionAutoDoubleSlippage> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.EditOpenPositionAutoDoubleSlippage) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        return new Menus.MenuEditOpenPositionSellAutoDoubleSlippage(callbackData.menuArg||'', env);
    }
}