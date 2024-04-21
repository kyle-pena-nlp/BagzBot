import { DecimalizedAmount } from "../../decimalized";
import { storeLegalAgreementStatus } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class LegalAgreementAgreeHandler extends BaseMenuCodeHandler<MenuCode.LegalAgreementAgree> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.LegalAgreementAgree) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        await storeLegalAgreementStatus(params.getTelegramUserID('real'), params.chatID, 'agreed', env);
        return new Menus.WelcomeScreenPart1(undefined, env);
    }
}
