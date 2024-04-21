import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class EditPositionChangeTokenHandler extends BaseMenuCodeHandler<MenuCode.EditPositionChangeToken> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.EditPositionChangeToken) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        return new ReplyQuestion("Enter address of new token:",
            ReplyQuestionCode.EditPositionChangeToken,
            context,
            {
                callback: {
                    linkedMessageID: messageID,
                    nextMenuCode: MenuCode.EditPositionChangeTokenSubmit
                },
                timeoutMS: Util.strictParseInt(env.QUESTION_TIMEOUT_MS)
        });
    }
}
