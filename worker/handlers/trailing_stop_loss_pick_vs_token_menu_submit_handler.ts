import { DecimalizedAmount } from "../../decimalized";
import { readSessionObj, storeSessionValues } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { getVsTokenInfo } from "../../tokens";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class TrailingStopLossPickVsTokenMenuSubmitHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossPickVsTokenMenuSubmit> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.TrailingStopLossPickVsTokenMenuSubmit) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const messageID = params.messageID;
        const trailingStopLossSelectedVsToken = callbackData.menuArg!!;
        const vsTokenAddress = getVsTokenInfo(trailingStopLossSelectedVsToken).address;
        const vsToken = getVsTokenInfo(trailingStopLossSelectedVsToken);
        await storeSessionValues(params.getTelegramUserID(), params.chatID, messageID, new Map<string,Util.Structural>([
            ["vsToken", vsToken],
            //["vsTokenAddress", vsTokenAddress]
        ]), POSITION_REQUEST_STORAGE_KEY, env);
        const trailingStopLossPositionRequestAfterSubmittingVsToken = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return await this.makeStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterSubmittingVsToken, maybeSOLBalance, env);
    }
}
