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

export class LegalAgreementRefuseHandler extends BaseMenuCodeHandler<MenuCode.LegalAgreementRefuse> {
    constructor(menuCode : MenuCode.LegalAgreementRefuse) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        await storeLegalAgreementStatus(params.getTelegramUserID('real'), params.chatID, 'refused', env);
        const youCanChangeYourMind = TGMessageChannel.createAndSend("You can agree to the legal agreement at any time if you change your mind!", false, params.chatID, env);
        TGMessageChannel.queueWait(youCanChangeYourMind, 10000);
        TGMessageChannel.queueRemoval(youCanChangeYourMind);
        context.waitUntil(TGMessageChannel.finalize(youCanChangeYourMind));
        await this.handleMenuClose(chatID, messageID, env);
        return;
    }
}
