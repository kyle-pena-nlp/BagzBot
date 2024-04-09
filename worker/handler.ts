import { DurableObjectNamespace } from "@cloudflare/workers-types";
import { randomUUID } from "node:crypto";
import { decryptPrivateKey } from "../crypto";
import { DecimalizedAmount, fromNumber } from "../decimalized";
import { claimInviteCode, listUnclaimedBetaInviteCodes } from "../durable_objects/beta_invite_codes/beta_invite_code_interop";
import { adminCountAllPositions, doHeartbeatWakeup } from "../durable_objects/heartbeat/heartbeat_do_interop";
import { GetTokenInfoResponse, isInvalidTokenInfoResponse, isValidTokenInfoResponse } from "../durable_objects/polled_token_pair_list/actions/get_token_info";
import { forceRebuildTokensList, getTokenInfo } from "../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { _devOnlyFeatureUpdatePrice, adminInvokeAlarm } from "../durable_objects/token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { OpenPositionRequest } from "../durable_objects/user/actions/open_new_position";
import { QuantityAndToken } from "../durable_objects/user/model/quantity_and_token";
import { TokenSymbolAndAddress } from "../durable_objects/user/model/token_name_and_address";
import { adminDeleteAllPositions, editTriggerPercentOnOpenPositionFromUserDO, getClosedPositionsAndPNLSummary, getDefaultTrailingStopLoss, getPositionFromUserDO, getUserData, getUserWalletSOLBalance, getWalletData, impersonateUser, listPositionsFromUserDO, manuallyClosePosition, maybeReadSessionObj, readSessionObj, requestNewPosition, sendMessageToUser, setSellAutoDoubleOnOpenPosition, setSellSlippagePercentOnOpenPosition, storeLegalAgreementStatus, storeSessionObj, storeSessionObjProperty, storeSessionValues, unimpersonateUser } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { logDebug, logError } from "../logging";
import { BaseMenu, LegalAgreement, MenuBetaInviteFriends, MenuCode, MenuComingSoon, MenuContinueMessage, MenuEditOpenPositionSellAutoDoubleSlippage, MenuEditOpenPositionSellSlippagePercent, MenuEditOpenPositionTriggerPercent, MenuEditPositionHelp, MenuEditPositionRequestSellAutoDoubleSlippage, MenuError, MenuFAQ, MenuListPositions, MenuMain, MenuOKClose, MenuPNLHistory, MenuTODO, MenuTrailingStopLossEntryBuyQuantity, MenuTrailingStopLossPickVsToken, MenuTrailingStopLossSlippagePercent, MenuTrailingStopLossTriggerPercent, MenuViewDecryptedWallet, MenuViewOpenPosition, MenuWallet, MenuWhatIsTSL, PositionIDAndChoice, SubmittedTriggerPctKey, WelcomeScreenPart1 } from "../menus";
import { PositionIDAndSellSlippagePercent } from "../menus/menu_edit_open_position_sell_slippage_percent";
import { MenuEditPositionRequest } from "../menus/menu_edit_position_request";
import { PositionPreRequest, PositionRequest, convertPreRequestToRequest } from "../positions";
import { ReplyQuestion, ReplyQuestionCode } from "../reply_question";
import { ReplyQuestionData, replyQuestionHasNextSteps } from "../reply_question/reply_question_data";
import { quoteBuy } from "../rpc/jupiter_quotes";
import { isGetQuoteFailure } from "../rpc/rpc_types";
import { POSITION_REQUEST_STORAGE_KEY } from "../storage_keys";
import { TGStatusMessage, TelegramWebhookInfo, deleteTGMessage, sendMessageToTG, updateTGMessage } from "../telegram";
import { TGMessageChannel } from "../telegram/telegram_status_message";
import { TokenInfo, WEN_ADDRESS, getVsTokenInfo } from "../tokens";
import { Structural, assertNever, makeFakeFailedRequestResponse, makeSuccessResponse, strictParseBoolean, strictParseFloat, strictParseInt, tryParseBoolean, tryParseFloat, tryParseInt } from "../util";
import { assertIs } from "../util/enums";
import { CallbackHandlerParams } from "./model/callback_handler_params";
import { TokenAddressExtractor } from "./token_address_extractor";

// TODO: -> CF environment variable.
const QUESTION_TIMEOUT_MS = 10000

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

    async listDurableObjectIDsInNamespace(namespace : DurableObjectNamespace) : Promise<string[]> {
        //const namespaceID = namespace
        return [];
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
            triggerPercent: defaultTSL.triggerPercent
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
        const messageID = params.messageID;
        const chatID = params.chatID;
        const callbackData = params.callbackData;
        logDebug(`Invoking callback with ${callbackData.toString()}`);
        const maybeSOLBalance = await getUserWalletSOLBalance(params.getTelegramUserID(), params.chatID, this.env);
        // TODO: factor this giant state machine switch statement into handlers (chain-of-responsibility-esque?)
        switch(callbackData.menuCode) {
            case MenuCode.Main:
                return this.createMainMenu(params, this.env);
            case MenuCode.NewPosition:
                const pr = await getDefaultTrailingStopLoss(params.getTelegramUserID(), chatID, messageID, this.env);
                const newPrerequest = pr.prerequest;
                let tokenInfoResponse = await getTokenInfo(newPrerequest.tokenAddress, this.env);
                if (!isValidTokenInfoResponse(tokenInfoResponse)) {
                    tokenInfoResponse = await getTokenInfo(WEN_ADDRESS, this.env);
                    if (!isValidTokenInfoResponse(tokenInfoResponse)) {
                        logError(`User could not open position editor because ${WEN_ADDRESS} DNE`, params);
                        return new MenuContinueMessage(`Editor could not be opened due to an unexpected error.`, MenuCode.Main);
                    }
                }
                const quote = await quoteBuy(newPrerequest, tokenInfoResponse.tokenInfo, this.env);
                const tokenInfo = tokenInfoResponse.tokenInfo;
                if (isGetQuoteFailure(quote)) {
                    return new MenuContinueMessage(`Could not get a quote for ${tokenInfo.symbol}. Please try again soon.`, MenuCode.Main);
                }
                const request = convertPreRequestToRequest(newPrerequest, quote, tokenInfoResponse.tokenInfo);
                await storeSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, request, POSITION_REQUEST_STORAGE_KEY, this.env);
                return new MenuEditPositionRequest({ positionRequest: request, maybeSOLBalance, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
            case MenuCode.Error:
                return new MenuError(undefined);
            case MenuCode.ViewDecryptedWallet:
                if (params.isImpersonatingAUser()) {
                    return new MenuContinueMessage('Not permitted to view an impersonated users private key', MenuCode.Main);
                }
                const walletDataResponse = await getWalletData(params.getTelegramUserID(), params.chatID, this.env);
                const decryptedPrivateKey = await decryptPrivateKey(walletDataResponse.wallet.encryptedPrivateKey, params.getTelegramUserID(), this.env);
                return new MenuViewDecryptedWallet({ publicKey: walletDataResponse.wallet.publicKey, decryptedPrivateKey: decryptedPrivateKey })
            case MenuCode.FAQ:
                return new MenuFAQ({ 
                    botName : this.env.TELEGRAM_BOT_DISPLAY_NAME,
                    botInstance : this.env.TELEGRAM_BOT_INSTANCE_DISPLAY_NAME,
                    botTagline: this.env.TELEGRAM_BOT_TAGLINE,
                    userID : params.getTelegramUserID(),
                    chatID : params.chatID
                });
            case MenuCode.ListPositions:
                const positions = await listPositionsFromUserDO(params.getTelegramUserID(), params.chatID, this.env);
                return new MenuListPositions(positions);
            case MenuCode.ViewOpenPosition:
                const viewPositionID = callbackData.menuArg!!;
                const positionAndMaybePNL = await getPositionFromUserDO(params.getTelegramUserID(), params.chatID, viewPositionID, this.env);
                if (positionAndMaybePNL == null) {
                    return new MenuContinueMessage('Sorry - this position no longer exists!', MenuCode.Main);
                }
                return new MenuViewOpenPosition({ data: positionAndMaybePNL, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
            case MenuCode.ClosePositionManuallyAction:
                const closePositionID = callbackData.menuArg;
                if (closePositionID != null) {
                    await this.handleManuallyClosePosition(params.getTelegramUserID(), params.chatID, closePositionID, this.env);
                }
                return new MenuContinueMessage(`We are closing this position.  You will receive notifications below.`, MenuCode.ViewOpenPosition, 'HTML', closePositionID);
            case MenuCode.CustomSlippagePct:
                const slippagePercentQuestion = new ReplyQuestion(
                    "Enter the desired slippage percent", 
                    ReplyQuestionCode.EnterSlippagePercent, 
                    this.context,
                    { 
                        callback: 
                        { 
                            nextMenuCode: MenuCode.SubmitSlippagePct, 
                            linkedMessageID: messageID
                        },
                        timeoutMS: QUESTION_TIMEOUT_MS
                    });
                return slippagePercentQuestion;
            case MenuCode.SubmitSlippagePct:
                const slipPctEntry = tryParseFloat(callbackData.menuArg||'');
                if (!slipPctEntry || slipPctEntry <= 0.0) {
                    return new MenuContinueMessage(`Sorry - '${callbackData.menuArg||''}' is not a valid percentage.`, MenuCode.TrailingStopLossSlippagePctMenu);
                }
                if (slipPctEntry) {
                    await storeSessionObjProperty(params.getTelegramUserID(), params.chatID, messageID, "slippagePercent", slipPctEntry, POSITION_REQUEST_STORAGE_KEY, this.env);
                }
                const positionRequestAfterEditingSlippagePct = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossRequestEditorMenu(positionRequestAfterEditingSlippagePct, maybeSOLBalance, this.env);                
            case MenuCode.CustomBuyQuantity:
                const buyQuantityQuestion  = new ReplyQuestion(
                    "Enter the quantity of SOL to buy", 
                    ReplyQuestionCode.EnterBuyQuantity, 
                    this.context,
                    { 
                        callback : {
                            nextMenuCode: MenuCode.SubmitBuyQuantity,
                            linkedMessageID: messageID
                        },
                        timeoutMS: QUESTION_TIMEOUT_MS
                    });
                return buyQuantityQuestion
            case MenuCode.SubmitBuyQuantity:
                const submittedBuyQuantity = tryParseFloat(callbackData.menuArg!!);
                if (!submittedBuyQuantity || submittedBuyQuantity <= 0.0) {
                    return new MenuContinueMessage(`Sorry - '${callbackData.menuArg||''}' is not a valid quantity of SOL to buy.`, MenuCode.TrailingStopLossSlippagePctMenu);
                }
                if (submittedBuyQuantity > strictParseFloat(this.env.SOL_BUY_LIMIT)) {
                    return new MenuContinueMessage(`Sorry - ${this.env.TELEGRAM_BOT_DISPLAY_NAME} does not currently allow purchases of over ${strictParseFloat(this.env.SOL_BUY_LIMIT)} SOL`, MenuCode.TrailingStopLossSlippagePctMenu); 
                }
                await storeSessionObjProperty(params.getTelegramUserID(), params.chatID, messageID, "vsTokenAmt", submittedBuyQuantity, POSITION_REQUEST_STORAGE_KEY, this.env);
                const trailingStopLossRequestStateAfterBuyQuantityEdited = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossRequestEditorMenu(trailingStopLossRequestStateAfterBuyQuantityEdited, maybeSOLBalance, this.env);
            case MenuCode.CustomTriggerPct:
                const triggerPctQuestion = new ReplyQuestion(
                    "Enter a custom trigger percent",
                    ReplyQuestionCode.EnterTriggerPercent,
                    this.context,
                    { 
                        callback : {
                            nextMenuCode: MenuCode.SubmitTriggerPct,
                            linkedMessageID: messageID
                        },
                        timeoutMS: QUESTION_TIMEOUT_MS
                    });
                return triggerPctQuestion;
            case MenuCode.SubmitTriggerPct:
                const triggerPctEntry = tryParseFloat(callbackData.menuArg!!);
                if (!triggerPctEntry || triggerPctEntry < 0 || triggerPctEntry >= 100) {
                    return new MenuContinueMessage(
                        `Sorry - '${callbackData.menuArg||''}' is not a valid percentage`,
                        MenuCode.TrailingStopLossTriggerPercentMenu);
                }
                await storeSessionObjProperty(params.getTelegramUserID(), params.chatID, messageID, "triggerPercent", triggerPctEntry, POSITION_REQUEST_STORAGE_KEY, this.env);
                const updatedTSL = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossRequestEditorMenu(updatedTSL, maybeSOLBalance, this.env);                
            case MenuCode.TrailingStopLossEditorFinalSubmit:
                // TODO: do the read within UserDO to avoid the extra roundtrip
                const positionRequestAfterFinalSubmit = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                const positionRequestRequest : OpenPositionRequest = { 
                    chatID: chatID, 
                    telegramUserID: params.getTelegramUserID(), 
                    positionRequest: positionRequestAfterFinalSubmit 
                };
                await requestNewPosition(params.getTelegramUserID(), positionRequestRequest, this.env);
                return;
            case MenuCode.TrailingStopLossEntryBuyQuantityMenu:
                const quantityAndTokenForBuyQuantityMenu : QuantityAndToken = await this.getTrailingStopLossPositionQuantityAndVsTokenFromSession(params.getTelegramUserID(), params.chatID, messageID, this.env);
                return new MenuTrailingStopLossEntryBuyQuantity({ quantityAndToken: quantityAndTokenForBuyQuantityMenu, isBeta: strictParseBoolean(this.env.IS_BETA_CODE_GATED) });
            case MenuCode.TrailingStopLossPickVsTokenMenu:
                const trailingStopLossVsTokenNameAndAddress : TokenSymbolAndAddress = await this.getTrailingStopLossPositionVsTokenFromSession(params.getTelegramUserID(), params.chatID, messageID, this.env);
                return new MenuTrailingStopLossPickVsToken(trailingStopLossVsTokenNameAndAddress);
            case MenuCode.TrailingStopLossPickVsTokenMenuSubmit:
                const trailingStopLossSelectedVsToken = callbackData.menuArg!!;
                const vsTokenAddress = getVsTokenInfo(trailingStopLossSelectedVsToken).address;
                const vsToken = getVsTokenInfo(trailingStopLossSelectedVsToken);
                await storeSessionValues(params.getTelegramUserID(), params.chatID, messageID, new Map<string,Structural>([
                    ["vsToken", vsToken],
                    //["vsTokenAddress", vsTokenAddress]
                ]), POSITION_REQUEST_STORAGE_KEY, this.env);
                const trailingStopLossPositionRequestAfterSubmittingVsToken = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterSubmittingVsToken, maybeSOLBalance, this.env);
            case MenuCode.TransferFunds:
                return new MenuTODO(MenuCode.Wallet);
            case MenuCode.Wallet:
                const userData = await getUserData(params.getTelegramUserID(), params.chatID, messageID, true, this.env);
                return new MenuWallet(userData);
            case MenuCode.Close:
                await this.handleMenuClose(params.chatID, params.messageID, this.env);
                return;
            case MenuCode.TrailingStopLossSlippagePctMenu:
                const x = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                const slippagePercent = x.slippagePercent;
                return new MenuTrailingStopLossSlippagePercent(slippagePercent);
            case MenuCode.TrailingStopLossTriggerPercentMenu:
                const y = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                const triggerPercent = y.triggerPercent;
                return new MenuTrailingStopLossTriggerPercent(triggerPercent);
            case MenuCode.TrailingStopLossRequestReturnToEditorMenu:
                const z = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossRequestEditorMenu(z, maybeSOLBalance, this.env);
            case MenuCode.BetaGateInviteFriends:
                const unclaimedBetaCodes = await listUnclaimedBetaInviteCodes({ userID : params.getTelegramUserID() }, this.env);
                if (!unclaimedBetaCodes.success) {
                    return this.createMainMenu(params, this.env);
                }
                const botUserName = this.env.TELEGRAM_BOT_USERNAME;
                return new MenuBetaInviteFriends({betaInviteCodes: unclaimedBetaCodes.data.betaInviteCodes, botUserName: botUserName });
            case MenuCode.EditPositionChangeToken:
                return new ReplyQuestion("Enter address of new token:", 
                    ReplyQuestionCode.EditPositionChangeToken, 
                    this.context, 
                    {
                        callback: {
                            linkedMessageID: messageID,
                            nextMenuCode: MenuCode.EditPositionChangeTokenSubmit
                        },
                        timeoutMS: QUESTION_TIMEOUT_MS
                });
            case MenuCode.EditPositionChangeTokenSubmit:
                const maybeTokenAddress = (callbackData.menuArg||'').trim();
                const tokenAddressExtractor = new TokenAddressExtractor();
                const newTokenAddress = tokenAddressExtractor.maybeExtractTokenAddress(maybeTokenAddress);
                if (newTokenAddress == null) {
                    return new MenuContinueMessage(`Sorry - we couldn't interpret this as a token address.`, MenuCode.TrailingStopLossRequestReturnToEditorMenu);
                }
                const positionRequest = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                if (positionRequest.token.address === newTokenAddress) {
                    return new MenuEditPositionRequest({ positionRequest: positionRequest, maybeSOLBalance, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
                }                
                const tokenValidationInfo = await getTokenInfo(newTokenAddress, this.env);
                if (isInvalidTokenInfoResponse(tokenValidationInfo)) {
                    return new MenuContinueMessage(`Sorry - <code>${newTokenAddress}</code> was not recognized as a valid token. If it is a new token, you may want to try in a few minutes.  See Jupiter's <a href='https://jup.ag/'>swap UI</a> for a list of supported tokens.`, MenuCode.TrailingStopLossRequestReturnToEditorMenu);
                }
                const newTokenInfo = tokenValidationInfo.tokenInfo;
                positionRequest.token = newTokenInfo;
                const maybeQuote = await quoteBuy(positionRequest, newTokenInfo, this.env);
                if (isGetQuoteFailure(maybeQuote)) {
                    return new MenuContinueMessage(`Sorry - could not get a quote for $${newTokenInfo.symbol}`, MenuCode.TrailingStopLossRequestReturnToEditorMenu);
                }
                positionRequest.quote = maybeQuote;
                await storeSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, positionRequest, POSITION_REQUEST_STORAGE_KEY, this.env);
                return new MenuEditPositionRequest({ positionRequest, maybeSOLBalance, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
            case MenuCode.WelcomeScreenPart1:
                return new WelcomeScreenPart1({ botDisplayName: this.env.TELEGRAM_BOT_DISPLAY_NAME });
            case MenuCode.LegalAgreement:
                return new LegalAgreement({ botDisplayName: this.env.TELEGRAM_BOT_DISPLAY_NAME });
            case MenuCode.LegalAgreementAgree:
                await storeLegalAgreementStatus(params.getTelegramUserID('real'), params.chatID, 'agreed', this.env);
                return new WelcomeScreenPart1({ botDisplayName: this.env.TELEGRAM_BOT_DISPLAY_NAME });
            case MenuCode.LegalAgreementRefuse:
                await storeLegalAgreementStatus(params.getTelegramUserID('real'), params.chatID, 'refused', this.env);
                const youCanChangeYourMind = TGMessageChannel.createAndSend("You can agree to the legal agreement at any time if you change your mind!", false, params.chatID, this.env);
                TGMessageChannel.queueWait(youCanChangeYourMind, 10000);
                TGMessageChannel.queueRemoval(youCanChangeYourMind);
                this.context.waitUntil(TGMessageChannel.finalize(youCanChangeYourMind));
                await this.handleMenuClose(chatID, messageID, this.env);
                return;
            case MenuCode.ImpersonateUser:
                const replyQuestion = new ReplyQuestion("Enter the user ID to begin user support for: ",
                    ReplyQuestionCode.ImpersonateUser,
                    this.context, 
                    {
                        callback: {
                            linkedMessageID: messageID,
                            nextMenuCode: MenuCode.SubmitImpersonateUser
                        }
                    });
                return replyQuestion;
            case MenuCode.SubmitImpersonateUser:
                const userIDToImpersonate = tryParseInt(callbackData.menuArg||'');
                if (!userIDToImpersonate) {
                    return new MenuContinueMessage(`Sorry, that can't be interpreted as a user ID: '${callbackData.menuArg||''}'`, MenuCode.Main);
                }
                await impersonateUser(params.getTelegramUserID('real'), params.chatID, userIDToImpersonate, this.env);
                params.impersonate(userIDToImpersonate, this.env);
                return this.createMainMenu(params, this.env);
            case MenuCode.UnimpersonateUser:
                // should already be done by worker, but just in case.
                await unimpersonateUser(params.getTelegramUserID('real'), params.chatID, this.env);
                params.unimpersonate(this.env);
                return this.createMainMenu(params, this.env);
            case MenuCode.EditPositionHelp:
                return new MenuEditPositionHelp(undefined);
            case MenuCode.BetaFeedbackQuestion:
                return new ReplyQuestion(
                    "Enter your feedback - it will be reviewed by the administrators", 
                    ReplyQuestionCode.SendBetaFeedback, 
                    this.context, {
                        callback: {
                            linkedMessageID: messageID,
                            nextMenuCode: MenuCode.SubmitBetaFeedback
                        },
                        timeoutMS: 45000
                    });
            case MenuCode.SubmitBetaFeedback:
                const betaFeedbackAnswer = (callbackData.menuArg||'').trim();
                if (betaFeedbackAnswer !== '') {
                    this.context.waitUntil(this.sendBetaFeedbackToSuperAdmin(betaFeedbackAnswer, params.getTelegramUserName(), params.getTelegramUserID()));
                }
                await new MenuOKClose("Thank you!").sendToTG({ chatID }, this.env);
                return;
            case MenuCode.AdminDevSetPrice:
                return new ReplyQuestion(
                    "Enter in format: tokenAddress/vsTokenAddress/price", 
                    ReplyQuestionCode.AdminDevSetPrice, 
                    this.context, {
                        callback: {
                            linkedMessageID: messageID,
                            nextMenuCode: MenuCode.SubmitAdminDevSetPrice
                        },
                        timeoutMS: 45000
                    });
            case MenuCode.SubmitAdminDevSetPrice:                
                const setPriceTokens = (callbackData.menuArg||'').split("/");
                if (setPriceTokens.length !== 3) {
                    return new MenuContinueMessage("Not in correct format", MenuCode.Main);
                }
                const [tA,vTA,priceString] = setPriceTokens;
                const manuallyRevisedPrice = tryParseFloat(priceString);
                if (manuallyRevisedPrice == null) {
                    return new MenuContinueMessage(`Not a valid float: ${priceString}`, MenuCode.Main);
                }
                const decimalizedPrice = fromNumber(manuallyRevisedPrice);
                const result = await _devOnlyFeatureUpdatePrice(params.getTelegramUserID(),tA,vTA,decimalizedPrice,this.env).catch(r => {
                    return null;
                });
                if (result == null) {
                    return new MenuContinueMessage(`Failure occurred when trying to update price of pair  ${tA}/${vTA} to ${manuallyRevisedPrice}`, MenuCode.Main);
                }
                return new MenuContinueMessage(`Price of pair ${tA}/${vTA} updated to ${manuallyRevisedPrice}`, MenuCode.Main)
            case MenuCode.EditOpenPositionTriggerPercent:
                const positionID = callbackData.menuArg||'';
                return new MenuEditOpenPositionTriggerPercent(positionID);
            case MenuCode.SubmitOpenPositionTriggerPct:
                const parsedCallbackData = SubmittedTriggerPctKey.parse(callbackData.menuArg||'');
                if (parsedCallbackData == null) {
                    return new MenuContinueMessage("Sorry - did not interpret this input", MenuCode.ListPositions);
                }
                const positionToEditID = parsedCallbackData.positionID;
                const editTriggerPercentResult = await editTriggerPercentOnOpenPositionFromUserDO(params.getTelegramUserID(), params.chatID, positionToEditID, parsedCallbackData.percent, this.env).catch(r => {
                    logError(r);
                    return null;
                });
                if (editTriggerPercentResult == null) {
                    return new MenuContinueMessage(`Sorry - there was a problem editing the trigger percent`, MenuCode.ListPositions);
                }
                else if (editTriggerPercentResult === 'is-closing') {
                    return new MenuContinueMessage(`Sorry - this position can no longer be edited because it is being sold`, MenuCode.ViewOpenPosition, 'HTML', parsedCallbackData.positionID);
                }
                else if (editTriggerPercentResult === 'is-closed') {
                    return new MenuContinueMessage(`Sorry - this position can no longer be edited because it is has been sold`, MenuCode.ViewOpenPosition, 'HTML', parsedCallbackData.positionID);
                }
                else if (editTriggerPercentResult === 'position-DNE') {
                    return new MenuContinueMessage(`Sorry - this position can no longer be edited because it is has been sold or does not exist`, MenuCode.ViewOpenPosition, 'HTML', parsedCallbackData.positionID);
                }
                else if (editTriggerPercentResult === 'invalid-percent') {
                    return new MenuContinueMessage(`Sorry - please choose a percent greater than zero and less than 100`, MenuCode.ViewOpenPosition, 'HTML', parsedCallbackData.positionID);
                }
                else {
                    return new MenuViewOpenPosition( { data: editTriggerPercentResult, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
                }
            case MenuCode.EditOpenPositionAutoDoubleSlippage:
                return new MenuEditOpenPositionSellAutoDoubleSlippage(callbackData.menuArg||'');
            case MenuCode.SubmitOpenPositionAutoDoubleSlippage:
                const posIDAndChoice = PositionIDAndChoice.parse(callbackData.menuArg||'');
                if (posIDAndChoice == null) {
                    return this.sorryError();
                }
                const posID = posIDAndChoice.positionID;
                const choice = posIDAndChoice.choice;
                await setSellAutoDoubleOnOpenPosition(params.getTelegramUserID(), params.chatID, posID, choice, this.env);
                return this.makeOpenPositionMenu(params,posID);
            case MenuCode.PosRequestChooseAutoDoubleSlippageOptions:
                return new MenuEditPositionRequestSellAutoDoubleSlippage(undefined);
            case MenuCode.SubmitPosRequestAutoDoubleSlippageOptions:
                const opAutoDoubleSlippage = tryParseBoolean((callbackData.menuArg||'').trim());
                if (opAutoDoubleSlippage == null) {
                    return this.sorryError();
                }
                else {
                    const x = await readSessionObj<PositionRequest>(
                        params.getTelegramUserID(), 
                        params.chatID, 
                        params.messageID, 
                        POSITION_REQUEST_STORAGE_KEY, 
                        this.env);                    
                    await storeSessionObjProperty(params.getTelegramUserID(), 
                        params.chatID, 
                        params.messageID, 
                        "sellAutoDoubleSlippage", 
                        opAutoDoubleSlippage, 
                        POSITION_REQUEST_STORAGE_KEY, 
                        this.env);
                    const pr = await readSessionObj<PositionRequest>(
                        params.getTelegramUserID(), 
                        params.chatID, 
                        params.messageID, 
                        POSITION_REQUEST_STORAGE_KEY, 
                        this.env);
                    return new MenuEditPositionRequest({ positionRequest: pr, maybeSOLBalance, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
                }
            case MenuCode.AdminInvokeAlarm:
                return new ReplyQuestion('Enter token address', ReplyQuestionCode.AdminInvokeAlarm, this.context, { callback: { linkedMessageID: params.messageID, nextMenuCode: MenuCode.SubmitAdminInvokeAlarm }});
            case MenuCode.SubmitAdminInvokeAlarm:
                const ti = await getTokenInfo(callbackData.menuArg||'',this.env);
                if (isValidTokenInfoResponse(ti)) {
                    await adminInvokeAlarm(callbackData.menuArg||'', getVsTokenInfo('SOL').address, this.env);
                    return new MenuContinueMessage('Alarm invoked', MenuCode.Main);
                }
                else {
                    return new MenuContinueMessage('Not a token', MenuCode.Main);
                }
            case MenuCode.AdminDeleteAllPositions:
                const deleteAllPositionsResponse = await adminDeleteAllPositions(params.getTelegramUserID(), params.chatID, params.getTelegramUserID('real'), this.env).catch(r => {
                    logError(r);
                    return null;
                });
                return new MenuContinueMessage(deleteAllPositionsResponse != null ? "Positions deleted" : "Error occurred", MenuCode.Main);
            case MenuCode.EditOpenPositionSellSlippagePercent:
                return new MenuEditOpenPositionSellSlippagePercent({ positionID : callbackData.menuArg||'' });
            case MenuCode.SubmitOpenPositionSellSlippagePercent:
                const positionIDAndSellSlippagePercent = PositionIDAndSellSlippagePercent.parse(callbackData.menuArg||'');
                if (positionIDAndSellSlippagePercent == null) {
                    return this.sorryError();
                }
                const updatedPosition = await setSellSlippagePercentOnOpenPosition(params.getTelegramUserID(), params.chatID, positionIDAndSellSlippagePercent.positionID, positionIDAndSellSlippagePercent.sellSlippagePercent, this.env);
                if (updatedPosition.positionAndMaybePNL == null) {
                    return this.sorryError();
                }
                return new MenuViewOpenPosition({ data: updatedPosition.positionAndMaybePNL, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
            case MenuCode.AdminSendUserMessage:
                return new ReplyQuestion("Enter userID|message", ReplyQuestionCode.AdminSendUserMessage, this.context, {
                    callback: {
                        linkedMessageID: params.messageID,
                        nextMenuCode: MenuCode.SubmitAdminSendUserMessage
                    },
                    timeoutMS: 60000
                });
            case MenuCode.SubmitAdminSendUserMessage:
                const tokens = (callbackData.menuArg||'').split("|");
                const recepientUserID = tryParseInt(tokens[0]||'');
                const message = tokens[1]||'';
                if (recepientUserID != null && message != null) {
                    await sendMessageToUser(recepientUserID, this.env.TELEGRAM_BOT_DISPLAY_NAME, params.getTelegramUserID(), message, this.env);
                    await new MenuOKClose(`Message sent.`).sendToTG({ chatID : params.chatID }, this.env);
                }
                else {
                    await new MenuOKClose(`Couldn't send message - incorrect format.`).sendToTG({ chatID : params.chatID }, this.env);
                }
                return;
            case MenuCode.ViewPNLHistory:
                const closedPositionsAndPNLSummary = await getClosedPositionsAndPNLSummary(params.getTelegramUserID(), params.chatID, this.env);
                return new MenuPNLHistory({ 
                    closedPositions: closedPositionsAndPNLSummary.closedPositions, 
                    netPNL: closedPositionsAndPNLSummary.closedPositionsPNLSummary.netSOL
                });
            case MenuCode.ComingSoon:
                return new MenuComingSoon(callbackData.menuArg||'');
            case MenuCode.AdminCountPositions:
                const positionCounts = await adminCountAllPositions(this.env);
                await TGStatusMessage.createAndSend(JSON.stringify(positionCounts), true, params.chatID, this.env);
                return;
            case MenuCode.MenuWhatIsTSL:
                return new MenuWhatIsTSL({ botDisplayName : this.env.TELEGRAM_BOT_DISPLAY_NAME });
            default:
                assertNever(callbackData.menuCode);
        }
    }

    private sorryError(menuCode ?: MenuCode, menuArg ?: string) : MenuContinueMessage {
        return new MenuContinueMessage(`We're sorry - an error has occurred`, menuCode || MenuCode.Main, 'HTML', menuArg);
    }

    private async makeOpenPositionMenu(params : CallbackHandlerParams, positionID : string) : Promise<BaseMenu> {
        const positionAndMaybePNL = await getPositionFromUserDO(params.getTelegramUserID(), params.chatID, positionID, this.env);
        if (positionAndMaybePNL == null) {
            return this.sorryError();
        }
        return new MenuViewOpenPosition({ data: positionAndMaybePNL, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
    }

    private async sendBetaFeedbackToSuperAdmin(feedback : string, myUserName : string, myUserID : number) : Promise<void> {
        await sendMessageToUser(strictParseInt(this.env.SUPER_ADMIN_USER_ID), myUserName, myUserID,feedback, this.env);
    }

    private async createMainMenu(info : CallbackHandlerParams | TelegramWebhookInfo, env : Env) : Promise<BaseMenu> {
        const userData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
        return new MenuMain({ ...userData, 
            isAdminOrSuperAdmin: info.isAdminOrSuperAdmin(env), 
            isImpersonatingUser: info.isImpersonatingAUser(),
            impersonatedUserID: info.isImpersonatingAUser() ? info.getTelegramUserID() : undefined,
            botName : this.getBotName(env),
            botTagline: env.TELEGRAM_BOT_TAGLINE,
            isBeta : env.ENVIRONMENT === 'beta',
            isDev : env.ENVIRONMENT === 'dev',
            isInviteCodeGated : strictParseBoolean(env.IS_BETA_CODE_GATED)
        });
    }

    private getBotName(env : Env) {
        return `${env.TELEGRAM_BOT_DISPLAY_NAME} - (${env.TELEGRAM_BOT_INSTANCE_DISPLAY_NAME})`;
    }

    private async handleMenuClose(chatID : number, messageID : number, env : Env) : Promise<Response> {
        const result = await deleteTGMessage(messageID, chatID, env);
        if (!result.success) {
            return makeFakeFailedRequestResponse(500, "Couldn't delete message");
        }
        else {
            return makeSuccessResponse();
        }
    }

    private async getTrailingStopLossPositionVsTokenFromSession(telegramUserID : number, chatID : number, messageID : number, env : Env) : Promise<TokenSymbolAndAddress> {
        const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return {
            tokenSymbol: positionRequest.vsToken.symbol,
            tokenAddress: positionRequest.vsToken.address
        };
    }

    private async getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramUserID : number, chatID : number, messageID : number, env: Env) : Promise<QuantityAndToken> {
        const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return {
            thisTokenSymbol:  positionRequest.vsToken.symbol,
            thisTokenAddress: positionRequest.vsToken.address,
            quantity: positionRequest.vsTokenAmt
        };
    }

    private async makeStopLossRequestEditorMenu(positionRequest : PositionRequest, maybeSOLBalance : DecimalizedAmount|null, env : Env) : Promise<BaseMenu> {
        await this.refreshQuote(positionRequest, env);
        return new MenuEditPositionRequest({ positionRequest, maybeSOLBalance, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() });
    }

    private async handleManuallyClosePosition(telegramUserID : number, chatID : number, positionID : string, env : Env) : Promise<Response> {
        const result = await manuallyClosePosition(telegramUserID, chatID, positionID, env);
        return makeSuccessResponse();
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
        await new WelcomeScreenPart1({ botDisplayName: this.env.TELEGRAM_BOT_DISPLAY_NAME }).sendToTG({ chatID : telegramWebhookInfo.chatID }, env);
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
                return ['...', new WelcomeScreenPart1({ botDisplayName: this.env.TELEGRAM_BOT_DISPLAY_NAME })];
            case '/legal_agreement':
                return ['...', new LegalAgreement({ botDisplayName: this.env.TELEGRAM_BOT_DISPLAY_NAME })];
            case '/faq':
                return ['...', new MenuFAQ({ 
                    botName : env.TELEGRAM_BOT_DISPLAY_NAME, 
                    botInstance: env.TELEGRAM_BOT_INSTANCE_DISPLAY_NAME, 
                    botTagline: env.TELEGRAM_BOT_TAGLINE,
                    userID : info.getTelegramUserID(),
                    chatID : info.chatID })];
            case '/list_positions':
                const positions = await listPositionsFromUserDO(info.getTelegramUserID(), info.chatID, env);
                return ['...', new MenuListPositions(positions)];
            case '/pnl_history':
                const closedPositionsAndPNLSummary = await getClosedPositionsAndPNLSummary(info.getTelegramUserID(), info.chatID, this.env);
                return ['...',new MenuPNLHistory({ closedPositions : closedPositionsAndPNLSummary.closedPositions, netPNL: closedPositionsAndPNLSummary.closedPositionsPNLSummary.netSOL })];
            case '/new_position':
                const defaultPr = await getDefaultTrailingStopLoss(info.getTelegramUserID(), info.chatID, messageID, env);
                const prerequest = defaultPr.prerequest;
                let tokenInfo : TokenInfo|null|'failed' = await getTokenInfo(prerequest.tokenAddress, env).then(r => r.tokenInfo).catch(r => 'failed');
                if (tokenInfo === 'failed') {
                    return ['...', new MenuOKClose(`Sorry - couldn't create a new position at this time`)];
                }
                else if (tokenInfo == null) {
                    // retry with WEN if default / last used token fails.
                    tokenInfo = await getTokenInfo(WEN_ADDRESS, env).then(r => r.tokenInfo);
                }
                if (tokenInfo == null || tokenInfo === 'failed') {
                    // If even WEN fails... out of luck, dear user.
                    return ['...', new MenuOKClose(`Sorry - couldn't create a new position at this time`)];
                }
                assertIs<TokenInfo,typeof tokenInfo>();
                const quote = await quoteBuy(prerequest, tokenInfo, this.env);

                // if getting the quote fails, early-out
                if (isGetQuoteFailure(quote)) {
                    return ['...', new MenuOKClose(`Sorry - couldn't create a new position at this time`)];
                }

                // now that we have a quote and tokenInfo, convert the pre-request to a request
                const positionRequest = convertPreRequestToRequest(prerequest, quote, tokenInfo);

                const storeObjectRequest = {
                    prefix: POSITION_REQUEST_STORAGE_KEY,
                    obj: positionRequest
                };

                const maybeSOLBalance = await getUserWalletSOLBalance(positionRequest.userID, positionRequest.chatID, this.env);

                return ['...', new MenuEditPositionRequest({ positionRequest, maybeSOLBalance, allowChooseAutoDoubleSlippage: this.allowChooseAutoDouble() }), storeObjectRequest];
            default:
                throw new Error(`Unrecognized command: ${command}`);
        }
    }

    private async refreshQuote(positionRequest : PositionRequest, env : Env) : Promise<boolean> {
        const quote = await quoteBuy(positionRequest, positionRequest.token, env);
        if (isGetQuoteFailure(quote)) {
            return false;
        }
        positionRequest.quote = quote;
        return true;
    }

    private allowChooseAutoDouble() : boolean {
        return strictParseBoolean(this.env.ALLOW_CHOOSE_AUTO_DOUBLE_SLIPPAGE);
    }
}