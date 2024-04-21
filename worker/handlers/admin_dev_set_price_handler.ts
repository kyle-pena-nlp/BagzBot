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

export class AdminDevSetPriceHandler extends BaseMenuCodeHandler<MenuCode.AdminDevSetPrice> {
    constructor(menuCode : MenuCode.AdminDevSetPrice) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
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
