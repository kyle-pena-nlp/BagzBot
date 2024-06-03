import { DecimalizedAmount } from "../../decimalized";
import { isValidTokenInfoResponse } from "../../durable_objects/polled_token_pair_list/actions/get_token_info";
import { getTokenInfo } from "../../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { getDefaultTrailingStopLoss, storeSessionObj } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { logError } from "../../logging";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionPreRequest, PositionRequest, Quote, convertPreRequestToRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { quoteBuy } from "../../rpc/jupiter_quotes";
import { isGetQuoteFailure } from "../../rpc/rpc_types";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { TokenInfo, WEN_ADDRESS } from "../../tokens";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class NewPositionHandler extends BaseMenuCodeHandler<MenuCode.NewPosition> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.NewPosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const pr = await getDefaultTrailingStopLoss(params.getTelegramUserID(), params.chatID, messageID, env);
        const newPrerequest = pr.prerequest;

        let result : 'invalid-token'|'quote-failure'|[Quote,TokenInfo] = 'invalid-token';
        result = await this.tryGetQuote(newPrerequest, env);
        // If the last used token can't get a quote anymore (i.e.; if it is rugged)... then try something else instead.
        if (result === 'invalid-token' || result === 'quote-failure') {
            newPrerequest.tokenAddress = WEN_ADDRESS;
            result = await this.tryGetQuote(newPrerequest, env);
        }
        // If we can't get a quote for WEN, something is seriously wrong.
        if (result === 'invalid-token' || result === 'quote-failure') {
            logError(`User could not open position editor because ${WEN_ADDRESS} DNE`, params);
            return new Menus.MenuContinueMessage(`Sorry - could not get a quote at this time. Please try again in a few minutes.`, MenuCode.Main, env);
        }

        const [quote,tokenInfo] = result;

        const request = convertPreRequestToRequest(newPrerequest, quote, tokenInfo);
        await storeSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, request, POSITION_REQUEST_STORAGE_KEY, env);
        return new Menus.MenuEditPositionRequest({ positionRequest: request, maybeSOLBalance }, env);
    }

    private async tryGetQuote(newPrerequest : PositionPreRequest, env : Env) : Promise<'invalid-token'|'quote-failure'|[Quote,TokenInfo]> {
        let tokenInfoResponse = await getTokenInfo(newPrerequest.tokenAddress, env);
        if (!isValidTokenInfoResponse(tokenInfoResponse)) {
            return 'invalid-token';
        }

        const quote = await quoteBuy(newPrerequest, tokenInfoResponse.tokenInfo, env);
        const tokenInfo = tokenInfoResponse.tokenInfo;
        if (isGetQuoteFailure(quote)) {
            return 'quote-failure';
        }

        return [quote,tokenInfo];
    }
}
