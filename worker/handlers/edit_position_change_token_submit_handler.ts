import { DecimalizedAmount } from "../../decimalized";
import { isInvalidTokenInfoResponse } from "../../durable_objects/polled_token_pair_list/actions/get_token_info";
import { getTokenInfo } from "../../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { readSessionObj, storeSessionObj } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { quoteBuy } from "../../rpc/jupiter_quotes";
import { isGetQuoteFailure } from "../../rpc/rpc_types";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { TokenAddressExtractor } from "../token_address_extractor";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class EditPositionChangeTokenSubmitHandler extends BaseMenuCodeHandler<MenuCode.EditPositionChangeTokenSubmit> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.EditPositionChangeTokenSubmit) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
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
