import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class CustomBuyQuantityHandler extends BaseMenuCodeHandler<MenuCode.CustomBuyQuantity> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.CustomBuyQuantity) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const buyQuantityQuestion  = new ReplyQuestion(
            "Enter the quantity of SOL to buy",
            ReplyQuestionCode.EnterBuyQuantity,
            context,
            {
                callback : {
                    nextMenuCode: MenuCode.SubmitBuyQuantity,
                    linkedMessageID: messageID
                },
                timeoutMS: Util.strictParseInt(env.QUESTION_TIMEOUT_MS)
            });
        return buyQuantityQuestion
    }
}
