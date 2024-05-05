import * as Menus from "../../menus";
import * as Util from "../../util";
import { DecimalizedAmount } from "../../decimalized";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { TGStatusMessage, TGMessageChannel } from "../../telegram";
import { logError, logDebug, logInfo } from "../../logging";
import { readSessionObj, storeSessionObj, storeSessionObjProperty } from "../../durable_objects/user/userDO_interop";
import { adminCountAllPositions } from "../../durable_objects/heartbeat/heartbeat_DO_interop";

export class AdminCountPositionsHandler extends BaseMenuCodeHandler<MenuCode.AdminCountPositions> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminCountPositions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const positionCounts = await adminCountAllPositions(env);
        await TGStatusMessage.createAndSend(JSON.stringify(positionCounts), true, params.chatID, env);
        return;
    }
}
