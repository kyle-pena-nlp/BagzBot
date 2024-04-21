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

export class NewPositionHandler extends BaseMenuCodeHandler<MenuCode.NewPosition> {
    constructor(menuCode : MenuCode.NewPosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const pr = await getDefaultTrailingStopLoss(params.getTelegramUserID(), chatID, messageID, env);
        const newPrerequest = pr.prerequest;
        let tokenInfoResponse = await getTokenInfo(newPrerequest.tokenAddress, env);
        if (!isValidTokenInfoResponse(tokenInfoResponse)) {
            tokenInfoResponse = await getTokenInfo(WEN_ADDRESS, env);
            if (!isValidTokenInfoResponse(tokenInfoResponse)) {
                logError(`User could not open position editor because ${WEN_ADDRESS} DNE`, params);
                return new Menus.MenuContinueMessage(`Editor could not be opened due to an unexpected error.`, MenuCode.Main, env);
            }
        }
        const quote = await quoteBuy(newPrerequest, tokenInfoResponse.tokenInfo, env);
        const tokenInfo = tokenInfoResponse.tokenInfo;
        // TODO: default back to WEN so this button isn't perma-broken for a banned token
        if (isGetQuoteFailure(quote)) {
            return new Menus.MenuContinueMessage(`Could not get a quote for ${tokenInfo.symbol}. Please try again soon.`, MenuCode.Main, env);
        }
        const request = convertPreRequestToRequest(newPrerequest, quote, tokenInfoResponse.tokenInfo);
        await storeSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, request, POSITION_REQUEST_STORAGE_KEY, env);
        return new Menus.MenuEditPositionRequest({ positionRequest: request, maybeSOLBalance }, env);
    }
}
