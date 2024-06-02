import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class AdminViewObjectHandler extends BaseMenuCodeHandler<MenuCode.AdminViewObject> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminViewObject) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        return new ReplyQuestion('Enter UserDO object ID', ReplyQuestionCode.AdminViewObject, context, {
            callback: {
                linkedMessageID: params.messageID,
                nextMenuCode: MenuCode.SubmitAdminViewObject
            },
            timeoutMS: 60000
        });
    }
}