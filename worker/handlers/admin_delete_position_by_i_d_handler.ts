import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class AdminDeletePositionByIDHandler extends BaseMenuCodeHandler<MenuCode.AdminDeletePositionByID> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminDeletePositionByID) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        return new ReplyQuestion('Enter position ID to delete', ReplyQuestionCode.AdminDeletePositionByID, context, {
            callback: {
                linkedMessageID: params.messageID,
                nextMenuCode: MenuCode.SubmitAdminDeletePositionByID
            },
            timeoutMS: 60000
        });
    }
}
