import { DecimalizedAmount } from "../../decimalized";
import { OpenPositionRequest } from "../../durable_objects/user/actions/open_new_position";
import { readSessionObj, requestNewPosition } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class TrailingStopLossEditorFinalSubmitHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossEditorFinalSubmit> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.TrailingStopLossEditorFinalSubmit) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        // TODO: do the read within UserDO to avoid the extra roundtrip
        const positionRequestAfterFinalSubmit = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        const positionRequestRequest : OpenPositionRequest = {
            chatID: params.chatID,
            telegramUserID: params.getTelegramUserID(),
            positionRequest: positionRequestAfterFinalSubmit
        };
        await requestNewPosition(params.getTelegramUserID(), positionRequestRequest, env);
        return;
    }
}
