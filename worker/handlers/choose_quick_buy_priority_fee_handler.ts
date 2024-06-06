import { DecimalizedAmount } from "../../decimalized";
import { Env, parsePriorityFeeOptions } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ChooseQuickBuyPriorityFeeHandler extends BaseMenuCodeHandler<MenuCode.ChooseQuickBuyPriorityFee> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ChooseQuickBuyPriorityFee) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const options = [
            { text: "Default", menuArg: "auto" }
        ];
        const priorityFeeOptions = parsePriorityFeeOptions(env);
        for (const [multiplier,multiplierName] of priorityFeeOptions) {
            options.push({ text: multiplierName, menuArg: multiplier.toString(10) });
        }
        const menuParams : Menus.PickOneParams = {
            text: "Choose Quick Buy Priority Fee Level",
            options : options,
            submitMenuCode: MenuCode.SubmitQuickBuyPriorityFee,
            backMenuCode: MenuCode.Settings,
            orientation: 'vertical'
        };
        return new Menus.MenuPickOne(menuParams, env);          
    }
}