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

export class EditPositionChangeTokenSubmitHandler extends BaseMenuCodeHandler<MenuCode.EditPositionChangeTokenSubmit> {
    constructor(menuCode : MenuCode.EditPositionChangeTokenSubmit) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const messageID = params.messageID;
        const maybeTokenAddress = (callbackData.menuArg||'').trim();
        const tokenAddressExtractor = new TokenAddressExtractor();
        const newTokenAddress = tokenAddressExtractor.maybeExtractTokenAddress(maybeTokenAddress);
        if (newTokenAddress == null) {
            return new Menus.MenuContinueMessage(`Sorry - we couldn't interpret this as a token address.`, MenuCode.ReturnToPositionRequestEditor, env);
        }
        const positionRequest = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        if (positionRequest.token.address === newTokenAddress) {
            return new Menus.MenuEditPositionRequest({ positionRequest: positionRequest, maybeSOLBalance }, env);
        }
        const tokenValidationInfo = await getTokenInfo(newTokenAddress, env);
        if (isInvalidTokenInfoResponse(tokenValidationInfo)) {
            return new Menus.MenuContinueMessage(`Sorry - <code>${newTokenAddress}</code> was not recognized as a valid token. If it is a new token, you may want to try in a few minutes.  See Jupiter's <a href='https://jup.ag/'>swap UI</a> for a list of supported tokens.`, MenuCode.ReturnToPositionRequestEditor, env);
        }
        const newTokenInfo = tokenValidationInfo.tokenInfo;
        positionRequest.token = newTokenInfo;
        const maybeQuote = await quoteBuy(positionRequest, newTokenInfo, env);
        if (isGetQuoteFailure(maybeQuote)) {
            return new Menus.MenuContinueMessage(`Sorry - could not get a quote for $${newTokenInfo.symbol}`, MenuCode.ReturnToPositionRequestEditor, env);
        }
        positionRequest.quote = maybeQuote;
        await storeSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, positionRequest, POSITION_REQUEST_STORAGE_KEY, env);
        return new Menus.MenuEditPositionRequest({ positionRequest, maybeSOLBalance }, env);
    }
}
