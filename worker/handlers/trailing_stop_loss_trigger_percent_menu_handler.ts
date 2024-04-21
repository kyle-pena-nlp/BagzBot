import { DecimalizedAmount } from "../../decimalized";
import { readSessionObj } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class TrailingStopLossTriggerPercentMenuHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossTriggerPercentMenu> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.TrailingStopLossTriggerPercentMenu) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const y = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        const triggerPercent = y.triggerPercent;
        return new Menus.MenuTrailingStopLossTriggerPercent(triggerPercent, env);
    }
}
