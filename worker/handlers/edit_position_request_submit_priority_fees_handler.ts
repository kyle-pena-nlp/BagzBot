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
import { PositionRequest } from "../../positions";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";

export class EditPositionRequestSubmitPriorityFeesHandler extends BaseMenuCodeHandler<MenuCode.EditPositionRequestSubmitPriorityFees> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.EditPositionRequestSubmitPriorityFees) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const selectedPriorityFee = Util.tryParseInt(callbackData.menuArg||'')||(callbackData.menuArg||'');
        await storeSessionObjProperty<PositionRequest>(params.getTelegramUserID(), params.chatID, params.messageID, "priorityFeeAutoMultiplier", selectedPriorityFee, POSITION_REQUEST_STORAGE_KEY, env);
        const posRequestWithPriorityFeeSet = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, params.messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return new Menus.MenuEditPositionRequest({ positionRequest: posRequestWithPriorityFeeSet, maybeSOLBalance }, env);
    }
}
