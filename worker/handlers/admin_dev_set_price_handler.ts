import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class AdminDevSetPriceHandler extends BaseMenuCodeHandler<MenuCode.AdminDevSetPrice> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminDevSetPrice) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        return new ReplyQuestion(
            "Enter in format: tokenAddress/vsTokenAddress/price",
            ReplyQuestionCode.AdminDevSetPrice,
            context, {
                callback: {
                    linkedMessageID: messageID,
                    nextMenuCode: MenuCode.SubmitAdminDevSetPrice
                },
                timeoutMS: 45000
            });
    }
}
