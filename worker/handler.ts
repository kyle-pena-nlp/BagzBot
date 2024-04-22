import { randomUUID } from "node:crypto";
import { DecimalizedAmount } from "../decimalized";
import { claimInviteCode } from "../durable_objects/beta_invite_codes/beta_invite_code_interop";
import { doHeartbeatWakeup } from "../durable_objects/heartbeat/heartbeat_do_interop";
import { GetTokenInfoResponse, isInvalidTokenInfoResponse } from "../durable_objects/polled_token_pair_list/actions/get_token_info";
import { forceRebuildTokensList, getTokenInfo } from "../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { getClosedPositionsAndPNLSummary, getDefaultTrailingStopLoss, getUserData, getUserWalletSOLBalance, listPositionsFromUserDO, maybeReadSessionObj, storeSessionObj } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { makeFakeFailedRequestResponse, makeSuccessResponse } from "../http";
import { logDebug } from "../logging";
import { BaseMenu, LegalAgreement, MenuFAQ, MenuListPositions, MenuMain, MenuOKClose, MenuPNLHistory, WelcomeScreenPart1 } from "../menus";
import { MenuEditPositionRequest } from "../menus/menu_edit_position_request";
import { AdminInfo } from "../menus/menu_main";
import { PositionPreRequest, PositionRequest, convertPreRequestToRequest } from "../positions";
import { ReplyQuestion, ReplyQuestionCode } from "../reply_question";
import { ReplyQuestionData, replyQuestionHasNextSteps } from "../reply_question/reply_question_data";
import { quoteBuy } from "../rpc/jupiter_quotes";
import { isGetQuoteFailure } from "../rpc/rpc_types";
import { POSITION_REQUEST_STORAGE_KEY } from "../storage_keys";
import { TelegramWebhookInfo, deleteTGMessage, sendMessageToTG, updateTGMessage } from "../telegram";
import { TokenInfo, WEN_ADDRESS } from "../tokens";
import { assertNever, groupIntoMap } from "../util";
import { assertIs } from "../util/enums";
import { MenuCodeHandlerCapabilities } from "./handlers/base_menu_code_handler";
import { MenuCodeHandlerMap } from "./menu_code_handler_map";
import { CallbackHandlerParams } from "./model/callback_handler_params";
import { TokenAddressExtractor } from "./token_address_extractor";

export class CallbackHandler {

    env : Env
    context: FetchEvent

    constructor(context : FetchEvent, env : Env) {
        this.env = env;
        this.context = context;
    }

    async handleMinuteCRONJob(env : Env) : Promise<void> {
        await doHeartbeatWakeup(env);
    }

    async handleRebuildTokensCRONJob(env : Env): Promise<void> {
        await forceRebuildTokensList(env);
    }

    // This is if the user directly messages the bot.
    async handleMessage(info : TelegramWebhookInfo) : Promise<Response> {
        
        // alias some things
        const chatID = info.chatID;
        const initiatingMessageID = info.messageID;
        const initiatingMessage = info.text||'';

        // try to parse the message as a token address
        const tokenAddressParser = new TokenAddressExtractor();
        const maybeTokenAddress = tokenAddressParser.maybeExtractTokenAddress(initiatingMessage);
        
        // if that didn't work, tell them so.
        if (maybeTokenAddress == null) {
            await sendMessageToTG(chatID, `'${initiatingMessage.trim()}' does not appear to be a valid token address.  You can paste in a token address or a birdeye.so link!  Also, see the "/new_position" command in the menu.`, this.env);
            return makeFakeFailedRequestResponse(404, "Token does not exist");
        }

        // assume the message is a token address, and fetch the token info
        const validateTokenResponse : GetTokenInfoResponse = await getTokenInfo(maybeTokenAddress, this.env);
        
        // if it's not valid, early-out
        if (isInvalidTokenInfoResponse(validateTokenResponse)) {
            const invalidTokenMsg = validateTokenResponse.isForbiddenToken ? 
                `The token address ${maybeTokenAddress} is not permitted for trading on ${this.env.TELEGRAM_BOT_DISPLAY_NAME}` : 
                `The token address '${maybeTokenAddress}' is not a known token. Try again in a few minutes if the token is new.  See Jupiter's <a href="https://jup.ag">swap UI</a> for a list of supported tokens.`;
            await sendMessageToTG(chatID, invalidTokenMsg, this.env, 'HTML', true);
            return makeFakeFailedRequestResponse(404, "Token does not exist");
        }

        // otherwise, read the tokenInfo, and let the user know the token exists.
        const tokenInfo = validateTokenResponse.tokenInfo;
        const conversation = await sendMessageToTG(info.chatID, `Token address '${tokenInfo.address}' (${tokenInfo.symbol}) recognized!`, this.env);
        if (!conversation.success) {
            return makeFakeFailedRequestResponse(500, "Failed to send response to telegram");
        }

        // start a new conversation, with the 'Token address recognized' message
        const conversationMessageID = conversation.messageID;

        // get default settings for a position request
        const r = await getDefaultTrailingStopLoss(info.getTelegramUserID(), chatID, initiatingMessageID, this.env);
        const defaultTSL = r.prerequest;

        // create a 'prerequest' (with certain things missing that would be in a full request)
        const prerequest : PositionPreRequest = {
            positionID: randomUUID(),
            userID : info.getTelegramUserID(),
            chatID: chatID,
            messageID: conversationMessageID,
            tokenAddress: defaultTSL.tokenAddress,
            vsToken: defaultTSL.vsToken,
            positionType : defaultTSL.positionType,
            vsTokenAmt: defaultTSL.vsTokenAmt,
            slippagePercent: defaultTSL.slippagePercent,
            sellAutoDoubleSlippage: defaultTSL.sellAutoDoubleSlippage,
            triggerPercent: defaultTSL.triggerPercent,
            priorityFeeAutoMultiplier: defaultTSL.priorityFeeAutoMultiplier
        };

        // get a quote for the token being swapped to
        const quote = await quoteBuy(prerequest, tokenInfo, this.env);

        // if getting the quote fails, early-out
        if (isGetQuoteFailure(quote)) {
            await sendMessageToTG(chatID, `Could not get a quote for ${tokenInfo.symbol}.`, this.env);
            return makeFakeFailedRequestResponse(404, "Token does not exist");
        }

        // now that we have a quote and tokenInfo, convert the pre-request to a request
        const positionRequest = convertPreRequestToRequest(prerequest, quote, tokenInfo);

        // store the fully formed request in session, associated with the conversation.
        await storeSessionObj<PositionRequest>(info.getTelegramUserID(), 
            info.chatID,
            conversationMessageID, 
            positionRequest, 
            POSITION_REQUEST_STORAGE_KEY, 
            this.env);

        // render the request editor menu
        const maybeSOLBalance = await getUserWalletSOLBalance(info.getTelegramUserID(), info.chatID, this.env);
        const menu = await this.makeStopLossRequestEditorMenu(positionRequest, maybeSOLBalance, this.env);
        await menu.sendToTG({ chatID, messageID : conversationMessageID }, this.env);
        return makeSuccessResponse();
    }

    async handleCallback(params : CallbackHandlerParams) : Promise<Response> {

        // process the callback
        const menuOrReplyQuestion = await this.handleCallbackQueryInternal(params);

        // we either get a new menu to render, a question to ask the user, or nothing.
        if (menuOrReplyQuestion == null) {
            return makeSuccessResponse();
        }
        else if ('question' in menuOrReplyQuestion) {
            await menuOrReplyQuestion.sendReplyQuestionToTG(params.getTelegramUserID('real'), params.chatID, this.env);
        }
        else if ('isMenu' in menuOrReplyQuestion) {
            await menuOrReplyQuestion.sendToTG({ chatID: params.chatID, messageID: params.messageID }, this.env);
        }
        else {
            assertNever(menuOrReplyQuestion);
        }

        return makeSuccessResponse();
    }

    // I'm fully aware this is an abomination.  
    // There was never a good time to refactor this and it's not broken.
    // But as soon as the hack-a-thon is done, I'm tackling it.
    async handleCallbackQueryInternal(params : CallbackHandlerParams) : Promise<BaseMenu|ReplyQuestion|void> {
        const maybeSOLBalance = await getUserWalletSOLBalance(params.getTelegramUserID(), params.chatID, this.env);
        logDebug(":::USER-CLICKED:::", params.callbackData.menuCode, params.callbackData.menuArg, params.getTelegramUserID());
        const result = await (MenuCodeHandlerMap[params.callbackData.menuCode] as unknown as MenuCodeHandlerCapabilities).handleCallback(params,maybeSOLBalance,this.context,this.env);
        return result;
    }

    private async makeStopLossRequestEditorMenu(positionRequest : PositionRequest, maybeSOLBalance : DecimalizedAmount|null, env : Env) : Promise<BaseMenu> {
        await this.refreshQuote(positionRequest, env);
        return new MenuEditPositionRequest({ positionRequest, maybeSOLBalance }, this.env);
    }

    // TODO: dedup with implementation in base_menu_code_handler.ts
    private async refreshQuote(positionRequest : PositionRequest, env : Env) : Promise<boolean> {
        const quote = await quoteBuy(positionRequest, positionRequest.token, env);
        if (isGetQuoteFailure(quote)) {
            return false;
        }
        positionRequest.quote = quote;
        return true;
    }      

    // todo: dedup implementation with base_menu_code_handler.ts
    private async createMainMenu(info : CallbackHandlerParams | TelegramWebhookInfo, env : Env) : Promise<BaseMenu> {
        const userData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
        return new MenuMain({ ...userData, ...this.makeAdminInfo(info, this.env) }, this.env);
    }

    // todo: dedup implementation with base_menu_code_handler.ts
    private makeAdminInfo(info : CallbackHandlerParams | TelegramWebhookInfo, env : Env) : AdminInfo {
        return { 
            isAdminOrSuperAdmin: info.isAdminOrSuperAdmin(env), 
            isImpersonatingUser: info.isImpersonatingAUser(),
            impersonatedUserID: info.isImpersonatingAUser() ? info.getTelegramUserID() : undefined
        };
    }

    async handleCommand(telegramWebhookInfo : TelegramWebhookInfo) : Promise<Response> {
        const command = telegramWebhookInfo.command!!;
        const tgMessage = await sendMessageToTG(telegramWebhookInfo.chatID, 'One moment...', this.env);
        if (!tgMessage.success) {
            return makeSuccessResponse();
        }
        const conversationMessageID = tgMessage.messageID;
        const [commandTextResponse,menu,storeSessionObjectRequest] = await this.handleCommandInternal(command, telegramWebhookInfo, conversationMessageID, this.env);
        const tgMessageInfo = await updateTGMessage(telegramWebhookInfo.chatID, conversationMessageID, commandTextResponse, this.env);
        if (!tgMessageInfo.success) {
            return makeSuccessResponse();
        }
        if (storeSessionObjectRequest != null) {
            await storeSessionObj(telegramWebhookInfo.getTelegramUserID(), telegramWebhookInfo.chatID, conversationMessageID, storeSessionObjectRequest.obj, storeSessionObjectRequest.prefix, this.env);
        }
        if (menu != null) {
            await menu.sendToTG({ chatID : telegramWebhookInfo.chatID, messageID :conversationMessageID}, this.env);
        }
        return makeSuccessResponse();
    }

    async handleReplyToBot(info : TelegramWebhookInfo) : Promise<Response> {
        const userAnswer = info.text||'';

        // read the callback data tucked away about the reply question
        const questionMessageID = info.messageID;
        const replyQuestionData = await maybeReadSessionObj<ReplyQuestionData>(info.getTelegramUserID('real'), info.chatID, questionMessageID, "replyQuestion", this.env);
        if (replyQuestionData == null) {
            return makeSuccessResponse();
        }

        // delete the question and reply messages from the chat (otherwise, it looks weird)
        const userReplyMessageID = info.realMessageID;
        if (userReplyMessageID) {
            await deleteTGMessage(userReplyMessageID, info.chatID, this.env);
        }
        await deleteTGMessage(questionMessageID, info.chatID, this.env);

        // handle whatever special logic the reply code entails
        const replyQuestionCode = replyQuestionData.replyQuestionCode;
        switch(replyQuestionCode) {
            case ReplyQuestionCode.EnterBetaInviteCode:
                await this.handleEnterBetaInviteCode(info, userAnswer||'', this.env);
                break;
            default:
                break;
        }
        // If the reply question has callback data, delegate to the handleCallback method
        if (replyQuestionHasNextSteps(replyQuestionData)) {
            const replyQuestionCallback = new CallbackHandlerParams(info, replyQuestionData);
            return await this.handleCallback(replyQuestionCallback);
        }
        return makeSuccessResponse();
    }

    async handleEnterBetaInviteCode(info: TelegramWebhookInfo, code : string, env : Env) {
        code = code.trim().toUpperCase();
        // operation is idempotent.  effect of operation is in .status of response
        const claimInviteCodeResponse = await claimInviteCode({ userID : info.getTelegramUserID(), inviteCode: code }, env);
        if (claimInviteCodeResponse.status === 'already-claimed-by-you') {
            await sendMessageToTG(info.chatID, `You have already claimed this invite code and are good to go!`, env);
        }
        else if (claimInviteCodeResponse.status === 'firsttime-claimed-by-you') {
            // greet the new user
            await this.sendUserWelcomeScreen(info, env);
        }
        else if (claimInviteCodeResponse.status === 'claimed-by-someone-else') {
            // tell user sorry, code is already claimed
            await sendMessageToTG(info.chatID, `Sorry ${info.getTelegramUserName()} - this invite code has already been claimed by someone else.`, env);
        }
        else if (claimInviteCodeResponse.status === 'code-does-not-exist') {
            // tell user sorry, that's not a real code
            await sendMessageToTG(info.chatID, `Sorry ${info.getTelegramUserName()} - '${code}' is not a known invite code.`, env);
            return makeSuccessResponse();
        }
        else if (claimInviteCodeResponse.status === 'you-already-claimed-different-code') {
            await sendMessageToTG(info.chatID, `You have already claimed a different invite code!`, env);
        }
    }

    private async sendUserWelcomeScreen(telegramWebhookInfo : TelegramWebhookInfo, env : Env) {
        await new WelcomeScreenPart1(undefined, this.env).sendToTG({ chatID : telegramWebhookInfo.chatID }, env);
    }

    private async handleCommandInternal(command : string, info : TelegramWebhookInfo, messageID : number, env : Env) : Promise<[string,BaseMenu?,{ obj : any, prefix : string }?]> {
        
        switch(command) {
            case '/start':
                const userData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
                const mainMenuStart = await this.createMainMenu(info, env);
                return ["...", mainMenuStart];
            case '/menu':
                const menuMain = await this.createMainMenu(info, env);
                return ['...', menuMain];
            case '/welcome_screen':
                return ['...', new WelcomeScreenPart1(undefined, this.env)];
            case '/legal_agreement':
                return ['...', new LegalAgreement(undefined, this.env)];
            case '/faq':
                return ['...', new MenuFAQ({ userID : info.getTelegramUserID(), chatID : info.chatID }, this.env)];
            case '/list_positions':
                const positions = await listPositionsFromUserDO(info.getTelegramUserID(), info.chatID, env);
                return ['...', new MenuListPositions(positions, this.env)];
            case '/pnl_history':
                const closedPositionsAndPNLSummary = await getClosedPositionsAndPNLSummary(info.getTelegramUserID(), info.chatID, this.env);
                const pnlHistoryPageIndex = 0;
                const groupedClosedPositions = [...groupIntoMap(closedPositionsAndPNLSummary.closedPositions, x => x.token.address).values()];
                groupedClosedPositions.sort(x => Math.min(...x.map(y => -(y.txSellAttemptTimeMS||0))));
                return ['...',new MenuPNLHistory({ items : groupedClosedPositions, netPNL: closedPositionsAndPNLSummary.closedPositionsPNLSummary.netSOL, pageIndex: pnlHistoryPageIndex }, this.env)];
            case '/new_position':
                const defaultPr = await getDefaultTrailingStopLoss(info.getTelegramUserID(), info.chatID, messageID, env);
                const prerequest = defaultPr.prerequest;
                let tokenInfo : TokenInfo|null|'failed' = await getTokenInfo(prerequest.tokenAddress, env).then(r => r.tokenInfo).catch(r => 'failed');
                if (tokenInfo === 'failed') {
                    return ['...', new MenuOKClose(`Sorry - couldn't create a new position at this time`, this.env)];
                }
                else if (tokenInfo == null) {
                    // retry with WEN if default / last used token fails.
                    tokenInfo = await getTokenInfo(WEN_ADDRESS, env).then(r => r.tokenInfo);
                }
                if (tokenInfo == null || tokenInfo === 'failed') {
                    // If even WEN fails... out of luck, dear user.
                    return ['...', new MenuOKClose(`Sorry - couldn't create a new position at this time`, this.env)];
                }
                assertIs<TokenInfo,typeof tokenInfo>();
                const quote = await quoteBuy(prerequest, tokenInfo, this.env);

                // TODO: default back to WEN so new_position command isn't perma-broken
                // if getting the quote fails, early-out
                if (isGetQuoteFailure(quote)) {
                    return ['...', new MenuOKClose(`Sorry - couldn't create a new position at this time`, this.env)];
                }

                // now that we have a quote and tokenInfo, convert the pre-request to a request
                const positionRequest = convertPreRequestToRequest(prerequest, quote, tokenInfo);

                const storeObjectRequest = {
                    prefix: POSITION_REQUEST_STORAGE_KEY,
                    obj: positionRequest
                };

                const maybeSOLBalance = await getUserWalletSOLBalance(positionRequest.userID, positionRequest.chatID, this.env);

                return ['...', new MenuEditPositionRequest({ positionRequest, maybeSOLBalance }, this.env), storeObjectRequest];
            default:
                throw new Error(`Unrecognized command: ${command}`);
        }
    }
}