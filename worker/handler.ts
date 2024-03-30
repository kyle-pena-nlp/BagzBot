import { randomUUID } from "node:crypto";
import { decryptPrivateKey } from "../crypto";
import { fromNumber } from "../decimalized";
import { claimInviteCode, listUnclaimedBetaInviteCodes } from "../durable_objects/beta_invite_codes/beta_invite_code_interop";
import { doHeartbeatWakeup } from "../durable_objects/heartbeat/heartbeat_do_interop";
import { GetTokenInfoResponse, isInvalidTokenInfoResponse, isValidTokenInfoResponse } from "../durable_objects/polled_token_pair_list/actions/get_token_info";
import { getTokenInfo } from "../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { _devOnlyFeatureUpdatePrice } from "../durable_objects/token_pair_position_tracker/token_pair_position_tracker_do_interop";
import { OpenPositionRequest } from "../durable_objects/user/actions/open_new_position";
import { CompletedAddressBookEntry, JustAddressBookEntryID, JustAddressBookEntryName } from "../durable_objects/user/model/address_book_entry";
import { QuantityAndToken } from "../durable_objects/user/model/quantity_and_token";
import { TokenSymbolAndAddress } from "../durable_objects/user/model/token_name_and_address";
import { editTriggerPercentOnOpenPositionFromUserDO, getAddressBookEntry, getDefaultTrailingStopLoss, getPositionFromUserDO, getUserData, getWalletData, impersonateUser, listAddressBookEntries, listPositionsFromUserDO, manuallyClosePosition, maybeReadSessionObj, readSessionObj, requestNewPosition, sendMessageToUser, storeAddressBookEntry, storeLegalAgreementStatus, storeSessionObj, storeSessionObjProperty, storeSessionValues, unimpersonateUser } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { logDebug, logError } from "../logging";
import { BaseMenu, LegalAgreement, MenuBetaInviteFriends, MenuCode, MenuConfirmAddressBookEntry, MenuConfirmTrailingStopLossPositionRequest, MenuContinueMessage, MenuEditOpenPositionTriggerPercent, MenuEditPositionHelp, MenuEditTrailingStopLossPositionRequest, MenuError, MenuFAQ, MenuHelp, MenuListPositions, MenuMain, MenuOKClose, MenuPickTransferFundsRecipient, MenuPleaseEnterToken, MenuStartTransferFunds, MenuTODO, MenuTrailingStopLossAutoRetrySell, MenuTrailingStopLossEntryBuyQuantity, MenuTrailingStopLossPickVsToken, MenuTrailingStopLossSlippagePercent, MenuTrailingStopLossTriggerPercent, MenuTransferFundsTestOrSubmitNow, MenuViewDecryptedWallet, MenuViewOpenPosition, MenuWallet, PositiveDecimalKeypad, PositiveIntegerKeypad, SubmittedTriggerPctKey, WelcomeScreenPart1, WelcomeScreenPart2 } from "../menus";
import { PositionPreRequest, PositionRequest, convertPreRequestToRequest } from "../positions";
import { ReplyQuestion, ReplyQuestionCode } from "../reply_question";
import { ReplyQuestionData, replyQuestionHasNextSteps } from "../reply_question/reply_question_data";
import { quoteBuy } from "../rpc/jupiter_quotes";
import { CompleteTransferFundsRequest, PartialTransferFundsRequest } from "../rpc/rpc_transfer_funds";
import { isGetQuoteFailure } from "../rpc/rpc_types";
import { POSITION_REQUEST_STORAGE_KEY } from "../storage_keys";
import { TelegramWebhookInfo, deleteTGMessage, sendMessageToTG, sendRequestToTG, updateTGMessage } from "../telegram";
import { WEN_ADDRESS, getVsTokenInfo } from "../tokens";
import { Structural, assertNever, makeFakeFailedRequestResponse, makeSuccessResponse, strictParseBoolean, strictParseInt, tryParseFloat, tryParseInt } from "../util";
import { CallbackHandlerParams } from "./model/callback_handler_params";
import { TokenAddressExtractor } from "./token_address_extractor";


const QUESTION_TIMEOUT_MS = 10000

export class Worker {

    env : Env
    context: FetchEvent

    constructor(context : FetchEvent, env : Env) {
        this.env = env;
        this.context = context;
    }

    async handleMinuteCRONJob(env : Env) : Promise<void> {
        await doHeartbeatWakeup(env);
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

        const tokenAddressParser = new TokenAddressExtractor()
        const maybeTokenAddress = tokenAddressParser.maybeExtractTokenAddress(initiatingMessage);
        
        if (maybeTokenAddress == null) {
            await sendMessageToTG(chatID, `'${initiatingMessage.trim()}' does not appear to be a valid token address`, this.env);
            return makeFakeFailedRequestResponse(404, "Token does not exist");
        }

        // assume the message is a token address, and fetch the token info
        const validateTokenResponse : GetTokenInfoResponse = await getTokenInfo(maybeTokenAddress, this.env);
        
        // if it's not valid, early-out
        if (isInvalidTokenInfoResponse(validateTokenResponse)) {
            const invalidTokenMsg = validateTokenResponse.isForbiddenToken ? 
                `The token address ${maybeTokenAddress} is not permitted for trading on ${this.env.TELEGRAM_BOT_NAME}` : 
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
            retrySellIfSlippageExceeded: defaultTSL.retrySellIfSlippageExceeded,
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

        const menu = await this.makeStopLossRequestEditorMenu(positionRequest, this.env);
        const menuRequest = menu.getUpdateExistingMenuRequest(chatID, conversationMessageID, this.env);
        await fetch(menuRequest);

        return makeSuccessResponse();
    }

    async handleCallback(params : CallbackHandlerParams) : Promise<Response> {
        const menuOrReplyQuestion = await this.handleCallbackQueryInternal(params);
        if (menuOrReplyQuestion == null) {
            return makeSuccessResponse();
        }
        else if ('question' in menuOrReplyQuestion) {
            await menuOrReplyQuestion.sendReplyQuestion(params.getTelegramUserID('real'), params.chatID, this.env);
        }
        else {
            const menuDisplayRequest = menuOrReplyQuestion.getUpdateExistingMenuRequest(params.chatID, params.messageID, this.env);
            await sendRequestToTG(menuDisplayRequest!!);
        }
        return makeSuccessResponse();
    }

    // TODO: switch to handlers, factor handlers out into little classes (preferably into the menu classes themselves)
    async handleCallbackQueryInternal(params : CallbackHandlerParams) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const chatID = params.chatID;
        const callbackData = params.callbackData;
        logDebug(`Invoking callback with ${callbackData.toString()}`);
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
                return new MenuEditTrailingStopLossPositionRequest(request);
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
                    botName : this.env.TELEGRAM_BOT_NAME,
                    botInstance : this.env.TELEGRAM_BOT_INSTANCE,
                    botTagline: this.env.TELEGRAM_BOT_TAGLINE
                });
            case MenuCode.Help:
                return new MenuHelp(undefined);
            case MenuCode.Invite:
                return this.TODOstubbedMenu(this.env);
            case MenuCode.PleaseEnterToken:
                return new MenuPleaseEnterToken(undefined);
            case MenuCode.ListPositions:
                const positions = await listPositionsFromUserDO(params.getTelegramUserID(), params.chatID, this.env);
                return new MenuListPositions(positions);
            case MenuCode.ViewOpenPosition:
                const viewPositionID = callbackData.menuArg!!;
                const positionAndMaybePNL = await getPositionFromUserDO(params.getTelegramUserID(), params.chatID, viewPositionID, this.env);
                if (positionAndMaybePNL == null) {
                    return new MenuContinueMessage('Sorry - this position was not found.', MenuCode.Main);
                }
                return new MenuViewOpenPosition(positionAndMaybePNL);
            case MenuCode.ClosePositionManuallyAction:
                const closePositionID = callbackData.menuArg;
                if (closePositionID != null) {
                    await this.handleManuallyClosePosition(params.getTelegramUserID(), params.chatID, closePositionID, this.env);
                }
                return this.createMainMenu(params, this.env);
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
                return await this.makeStopLossRequestEditorMenu(positionRequestAfterEditingSlippagePct, this.env);                
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
                if (submittedBuyQuantity > 5.0 && strictParseBoolean(this.env.IS_BETA_CODE_GATED)) {
                    return new MenuContinueMessage(`Sorry - ${this.env.TELEGRAM_BOT_NAME} is in BETA and does not allow purchases of over 5.0 SOL`, MenuCode.TrailingStopLossSlippagePctMenu); 
                }
                await storeSessionObjProperty(params.getTelegramUserID(), params.chatID, messageID, "vsTokenAmt", submittedBuyQuantity, POSITION_REQUEST_STORAGE_KEY, this.env);
                const trailingStopLossRequestStateAfterBuyQuantityEdited = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossRequestEditorMenu(trailingStopLossRequestStateAfterBuyQuantityEdited, this.env);
            case MenuCode.TrailingStopLossChooseAutoRetrySellMenu:
                return new MenuTrailingStopLossAutoRetrySell(undefined);
            case MenuCode.TrailingStopLossChooseAutoRetrySellSubmit:
                await storeSessionObjProperty(params.getTelegramUserID(), params.chatID, messageID, "retrySellIfSlippageExceeded", callbackData.menuArg === "true", POSITION_REQUEST_STORAGE_KEY, this.env);
                const trailingStopLossRequestStateAfterAutoRetrySellEdited = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossRequestEditorMenu(trailingStopLossRequestStateAfterAutoRetrySellEdited, this.env);
            case MenuCode.TrailingStopLossConfirmMenu:
                const trailingStopLossRequestAfterDoneEditing = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossConfirmMenu(trailingStopLossRequestAfterDoneEditing, this.env);
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
                if (!triggerPctEntry || triggerPctEntry < 0) {
                    return new MenuContinueMessage(
                        `Sorry - '${callbackData.menuArg||''}' is not a valid percentage`,
                        MenuCode.TrailingStopLossTriggerPercentMenu);
                }
                await storeSessionObjProperty(params.getTelegramUserID(), params.chatID, messageID, "triggerPercent", triggerPctEntry, POSITION_REQUEST_STORAGE_KEY, this.env);
                const updatedTSL = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, this.env);
                return await this.makeStopLossRequestEditorMenu(updatedTSL, this.env);                
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
                return new MenuTrailingStopLossEntryBuyQuantity(quantityAndTokenForBuyQuantityMenu);
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
                return await this.makeStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterSubmittingVsToken, this.env);
            case MenuCode.TransferFunds:
                // TODO
                return this.TODOstubbedMenu(this.env);
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
                return await this.makeStopLossRequestEditorMenu(z, this.env);
            case MenuCode.AddFundsRecipientAddress:
                const addressBookEntry : JustAddressBookEntryID = { 
                    addressBookEntryID : randomUUID()
                };
                await storeSessionObj<JustAddressBookEntryID>(params.getTelegramUserID(), params.chatID, messageID, addressBookEntry, "addressBookEntry", this.env);
                return new ReplyQuestion("Choose a name for this recipient", 
                    ReplyQuestionCode.EnterAddressBookEntryName, 
                    this.context, 
                    { 
                        callback: { 
                            nextMenuCode: MenuCode.SubmitAddressBookEntryName, 
                            linkedMessageID: messageID 
                        },
                        timeoutMS: QUESTION_TIMEOUT_MS
                    });
            case MenuCode.SubmitAddressBookEntryName:
                const addressBookEntry2 = await readSessionObj<JustAddressBookEntryID>(params.getTelegramUserID(), params.chatID, messageID, "addressBookEntry", this.env);
                const addressBookEntry3 : JustAddressBookEntryName = { ...addressBookEntry2, name : callbackData.menuArg||'' } ;//name = callbackData.menuArg;
                await storeSessionObj<JustAddressBookEntryName>(params.getTelegramUserID(), params.chatID, messageID, addressBookEntry3, "addressBookEntry", this.env);
                return new ReplyQuestion("Paste in the address", 
                    ReplyQuestionCode.EnterTransferFundsRecipient, 
                    this.context, 
                    { 
                        callback: { 
                            nextMenuCode: MenuCode.SubmitAddressBookEntryAddress, 
                            linkedMessageID: messageID 
                        },
                        timeoutMS: QUESTION_TIMEOUT_MS
                    });
            case MenuCode.SubmitAddressBookEntryAddress: 
                const addressBookEntry4 = await readSessionObj<JustAddressBookEntryName>(params.getTelegramUserID(), params.chatID, messageID, "addressBookEntry", this.env);
                const addressBookEntry5 : CompletedAddressBookEntry = { ...addressBookEntry4, address: callbackData.menuArg||'', confirmed : false };
                await storeSessionObj<CompletedAddressBookEntry>(params.getTelegramUserID(), params.chatID, messageID, addressBookEntry5, "addressBookEntry", this.env);
                return new MenuConfirmAddressBookEntry(addressBookEntry5);
            case MenuCode.SubmitAddressBookEntry:
                const addressBookEntryFinal = await readSessionObj<CompletedAddressBookEntry>(params.getTelegramUserID(), params.chatID, messageID, "addressBookEntry", this.env);
                const response = await storeAddressBookEntry(params.getTelegramUserID(), params.chatID, addressBookEntryFinal, this.env);
                if (!response.success) {
                    return new MenuContinueMessage(`Could not store address book entry`, MenuCode.TransferFunds);
                }
                return new MenuStartTransferFunds(undefined);
            case MenuCode.PickTransferFundsRecipient:
                const addressBookEntries = await listAddressBookEntries(params.getTelegramUserID(), params.chatID, this.env);
                return new MenuPickTransferFundsRecipient(addressBookEntries.addressBookEntries);
            case MenuCode.TransferFundsRecipientSubmitted:
                const addressBookId = callbackData.menuArg||'';
                const selectedAddressBookEntry = await getAddressBookEntry(params.getTelegramUserID(), params.chatID, addressBookId, this.env);
                if (selectedAddressBookEntry == null) {
                    return new MenuContinueMessage(`Address book entry not found`, MenuCode.TransferFunds);
                }
                const partialTransferFundsRequest : PartialTransferFundsRequest = { recipientAddress: selectedAddressBookEntry.address };
                await storeSessionObj<PartialTransferFundsRequest>(params.getTelegramUserID(), params.chatID, messageID, partialTransferFundsRequest, "transferFundsRequest", this.env);
                return new PositiveDecimalKeypad("${currentValue} SOL", MenuCode.KeypadTransferFundsQuantity, MenuCode.SubmitTransferFundsQuantity, MenuCode.TransferFunds, "1.0", 0.0);
            case MenuCode.KeypadTransferFundsQuantity:
                const tfEntry = callbackData.menuArg||'';
                return new PositiveDecimalKeypad("${currentValue} SOL", MenuCode.KeypadTransferFundsQuantity, MenuCode.SubmitTransferFundsQuantity, MenuCode.TransferFunds, tfEntry, 0.0);
            case MenuCode.SubmitTransferFundsQuantity:
                const tfQuantity = tryParseFloat(callbackData.menuArg||'');
                if (tfQuantity == null) {
                    return new MenuContinueMessage(`Invalid transfer funds quantity`, MenuCode.TransferFunds);
                }
                const tfFundsRequest = await readSessionObj<PartialTransferFundsRequest>(params.getTelegramUserID(), params.chatID, messageID, "transferFundsRequest", this.env);
                const completeTfFundsRequest : CompleteTransferFundsRequest = { ...tfFundsRequest, solQuantity: tfQuantity };
                await storeSessionObj<CompleteTransferFundsRequest>(params.getTelegramUserID(), params.chatID, messageID, completeTfFundsRequest, "transferFundsRequest", this.env);
                return new MenuTransferFundsTestOrSubmitNow(completeTfFundsRequest);
            case MenuCode.TransferFundsDoTestTransfer:
                throw new Error("");
            case MenuCode.TransferFundsDoTransfer:
                throw new Error("");
            case MenuCode.AddressBookEntryPerformTestTransfer:
                throw new Error("");
            case MenuCode.RemoveAddressBookEntry:
                throw new Error("");
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
                    return new MenuEditTrailingStopLossPositionRequest(positionRequest);
                }                
                const tokenValidationInfo = await getTokenInfo(newTokenAddress, this.env);
                if (isInvalidTokenInfoResponse(tokenValidationInfo)) {
                    return new MenuContinueMessage(`Sorry - ${newTokenAddress} was not recognized as a valid token. If it is a new token, you may want to try in a few minutes.  See Jupiter's <a href='https://jup.ag/'>swap UI</a> for a list of supported tokens.`, MenuCode.TrailingStopLossRequestReturnToEditorMenu);
                }
                const newTokenInfo = tokenValidationInfo.tokenInfo;
                positionRequest.token = newTokenInfo;
                const maybeQuote = await quoteBuy(positionRequest, newTokenInfo, this.env);
                if (isGetQuoteFailure(maybeQuote)) {
                    return new MenuContinueMessage(`Sorry - could not get a quote for $${newTokenInfo.symbol}`, MenuCode.TrailingStopLossRequestReturnToEditorMenu);
                }
                positionRequest.quote = maybeQuote;
                await storeSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, positionRequest, POSITION_REQUEST_STORAGE_KEY, this.env);
                return new MenuEditTrailingStopLossPositionRequest(positionRequest);
            case MenuCode.WelcomeScreenPart1:
                return new WelcomeScreenPart1(undefined);
            case MenuCode.WelcomeScreenPart2:
                return new WelcomeScreenPart2(undefined);
            case MenuCode.LegalAgreement:
                return new LegalAgreement(undefined);
            case MenuCode.LegalAgreementAgree:
                await storeLegalAgreementStatus(params.getTelegramUserID('real'), params.chatID, 'agreed', this.env);
                return new WelcomeScreenPart1(undefined);
            case MenuCode.LegalAgreementRefuse:
                await storeLegalAgreementStatus(params.getTelegramUserID('real'), params.chatID, 'refused', this.env);
                await sendMessageToTG(chatID, "You can agree at any time by opening the legal agreement in the menu", this.env);
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
                    this.context.waitUntil(this.sendBetaFeedbackToSuperAdmin(betaFeedbackAnswer, params.getTelegramUserName()));
                }
                const thankYouDialogueRequest = new MenuOKClose("Thank you!").getCreateNewMenuRequest(chatID, this.env);
                await fetch(thankYouDialogueRequest).catch(r => {
                    logError("Failed to send thank you");
                    return null;
                });
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
                    return new MenuViewOpenPosition(editTriggerPercentResult);
                }
            default:
                assertNever(callbackData.menuCode);
        }
    }

    private async sendBetaFeedbackToSuperAdmin(feedback : string, myUserName : string) : Promise<void> {
        await sendMessageToUser(strictParseInt(this.env.SUPER_ADMIN_USER_ID), myUserName, feedback, this.env);
    }

    private async createMainMenu(info : CallbackHandlerParams, env : Env) : Promise<BaseMenu> {
        const userData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
        return new MenuMain({ ...userData, 
            isAdminOrSuperAdmin: info.isAdminOrSuperAdmin(env), 
            isImpersonatingUser: info.isImpersonatingAUser(),
            impersonatedUserID: info.isImpersonatingAUser() ? info.getTelegramUserID() : undefined,
            botName : this.getBotName(env),
            botTagline: env.TELEGRAM_BOT_TAGLINE,
            isBeta : strictParseBoolean(env.IS_BETA_CODE_GATED),
            isDev : env.ENVIRONMENT === 'dev'
        });
    }

    private getBotName(env : Env) {
        return `${env.TELEGRAM_BOT_NAME} (${env.TELEGRAM_BOT_INSTANCE})`;
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

    private makeTrailingStopLossCustomTriggerPercentKeypad(currentValue : string) {
        return new PositiveIntegerKeypad(
            "${currentValue}%", // intentional double quotes - syntax is parsed later
            MenuCode.CustomTriggerPct,
            MenuCode.SubmitTriggerPct,
            MenuCode.TrailingStopLossRequestReturnToEditorMenu,
            currentValue,
            1,
            100);
    }

    private async makeStopLossRequestEditorMenu(positionRequest : PositionRequest, env : Env) : Promise<BaseMenu> {
        await this.refreshQuote(positionRequest, env);
        return new MenuEditTrailingStopLossPositionRequest(positionRequest);
    }

    private async makeStopLossConfirmMenu(positionRequest: PositionRequest, env : Env) : Promise<BaseMenu> {
        await this.refreshQuote(positionRequest, env);
        return new MenuConfirmTrailingStopLossPositionRequest(positionRequest);
    }

    private TODOstubbedMenu(env : Env) : BaseMenu {
        return new MenuTODO(undefined);
    }

    private async handleManuallyClosePosition(telegramUserID : number, chatID : number, positionID : string, env : Env) : Promise<Response> {
        const result = await manuallyClosePosition(telegramUserID, chatID, positionID, env);
        return makeSuccessResponse();
    }

    // TODO: this is a total mess
    async handleCommand(telegramWebhookInfo : TelegramWebhookInfo) : Promise<Response> {
        const command = telegramWebhookInfo.command!!;
        const tgMessage = await sendMessageToTG(telegramWebhookInfo.chatID, 'Processing command', this.env);
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
            const menuDisplayRequest = menu.getUpdateExistingMenuRequest(telegramWebhookInfo.chatID, conversationMessageID, this.env);
            fetch(menuDisplayRequest);
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
            case ReplyQuestionCode.EnterTransferFundsRecipient:
                break;
            case ReplyQuestionCode.EnterAddressBookEntryName:
                break;
            case ReplyQuestionCode.EnterSlippagePercent:
                break;
            case ReplyQuestionCode.EnterBuyQuantity:
                break;
            case ReplyQuestionCode.EnterTriggerPercent:
                break;
            case ReplyQuestionCode.EditPositionChangeToken:
                break;
            case ReplyQuestionCode.ImpersonateUser:
                break;
            case ReplyQuestionCode.SendBetaFeedback:
                break;
            case ReplyQuestionCode.AdminDevSetPrice:
                break;
            default:
                assertNever(replyQuestionCode);
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
        }
        else if (claimInviteCodeResponse.status === 'you-already-claimed-different-code') {
            await sendMessageToTG(info.chatID, `You have already claimed a different beta code!`, env);
        }
    }

    private async sendUserWelcomeScreen(telegramWebhookInfo : TelegramWebhookInfo, env : Env) {
        const request = new WelcomeScreenPart1(undefined).getCreateNewMenuRequest(telegramWebhookInfo.chatID, env);
        await fetch(request);
    }

    private async handleCommandInternal(command : string, info : TelegramWebhookInfo, messageID : number, env : Env) : Promise<[string,BaseMenu?,{ obj : any, prefix : string }?]> {
        
        switch(command) {
            case '/start':
                const userData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
                return ["...", new MenuMain({ 
                    ...userData, 
                    isAdminOrSuperAdmin: info.isAdminOrSuperAdmin(env), 
                    isImpersonatingUser : info.isImpersonatingAUser(), 
                    impersonatedUserID: info.isImpersonatingAUser() ? info.getTelegramUserID() : undefined,
                    botName : this.getBotName(env),
                    botTagline: env.TELEGRAM_BOT_TAGLINE,
                    isBeta: strictParseBoolean(env.IS_BETA_CODE_GATED),
                    isDev : env.ENVIRONMENT === 'dev'
                })];
            case '/menu':
                const menuUserData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
                return ['...', new MenuMain({ 
                    ...menuUserData, 
                    isAdminOrSuperAdmin : info.isAdminOrSuperAdmin(env), 
                    isImpersonatingUser: info.isImpersonatingAUser(), 
                    impersonatedUserID: info.isImpersonatingAUser() ? info.getTelegramUserID() : undefined,
                    botName : this.getBotName(env),
                    botTagline: env.TELEGRAM_BOT_TAGLINE,
                    isBeta : strictParseBoolean(env.IS_BETA_CODE_GATED),
                    isDev : env.ENVIRONMENT === 'dev'
                })];
            case '/welcome_screen':
                return ['...', new WelcomeScreenPart1(undefined)];
            case '/legal_agreement':
                return ['...', new LegalAgreement(undefined)];
            case '/help':
                return ['...', new MenuHelp(undefined)];
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
}