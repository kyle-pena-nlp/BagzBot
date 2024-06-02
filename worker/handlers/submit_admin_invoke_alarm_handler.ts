import { DecimalizedAmount } from "../../decimalized";
import { isValidTokenInfoResponse } from "../../durable_objects/polled_token_pair_list/actions/get_token_info";
import { getTokenInfo } from "../../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitAdminInvokeAlarmHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminInvokeAlarm> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitAdminInvokeAlarm) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const ti = await getTokenInfo(callbackData.menuArg||'',env);
        if (isValidTokenInfoResponse(ti)) {
            //await adminInvokeAlarm(callbackData.menuArg||'', getVsTokenInfo('SOL').address, env);
            return new Menus.MenuContinueMessage('Alarm invoked', MenuCode.Main, env);
        }
        else {
            return new Menus.MenuContinueMessage('Not a token', MenuCode.Main, env);
        }
    }
}
