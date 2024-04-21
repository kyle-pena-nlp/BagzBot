import { DecimalizedAmount } from "../../decimalized";
import { isValidTokenInfoResponse } from "../../durable_objects/polled_token_pair_list/actions/get_token_info";
import { getTokenInfo } from "../../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { getDefaultTrailingStopLoss, storeSessionObj } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { logError } from "../../logging";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest, convertPreRequestToRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { quoteBuy } from "../../rpc/jupiter_quotes";
import { isGetQuoteFailure } from "../../rpc/rpc_types";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { WEN_ADDRESS } from "../../tokens";
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
