import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { addAutoDoubleSlippageVerbiage } from "../../menus/auto_double_slippage_verbiage";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class PosRequestChooseAutoDoubleSlippageOptionsHandler extends BaseMenuCodeHandler<MenuCode.PosRequestChooseAutoDoubleSlippageOptions> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.PosRequestChooseAutoDoubleSlippageOptions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const text : string[] = [];
        addAutoDoubleSlippageVerbiage(text);
        return new Menus.MenuChooseAutoDoubleSlippage({ 
            text: text.join("\r\n"), 
            submitMenuCode: MenuCode.SubmitPosRequestAutoDoubleSlippageOptions, 
            backMenuCode: MenuCode.ReturnToPositionRequestEditor 
        }, env);
    }
}
