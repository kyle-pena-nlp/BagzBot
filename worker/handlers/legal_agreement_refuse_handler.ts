import { DecimalizedAmount } from "../../decimalized";
import { storeLegalAgreementStatus } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { TGMessageChannel } from "../../telegram";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class LegalAgreementRefuseHandler extends BaseMenuCodeHandler<MenuCode.LegalAgreementRefuse> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.LegalAgreementRefuse) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        await storeLegalAgreementStatus(params.getTelegramUserID('real'), params.chatID, 'refused', env);
        const youCanChangeYourMind = TGMessageChannel.createAndSend("You can agree to the legal agreement at any time if you change your mind!", false, params.chatID, env);
        TGMessageChannel.queueWait(youCanChangeYourMind, 10000);
        TGMessageChannel.queueRemoval(youCanChangeYourMind);
        context.waitUntil(TGMessageChannel.finalize(youCanChangeYourMind));
        await this.handleMenuClose(params.chatID, messageID, env);
        return;
    }
}
