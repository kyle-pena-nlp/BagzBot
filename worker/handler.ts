import { randomUUID } from "node:crypto";
import { decryptPrivateKey } from "../crypto";
import { claimInviteCode, listUnclaimedBetaInviteCodes } from "../durable_objects/beta_invite_codes/beta_invite_code_interop";
import { GetTokenInfoResponse, isInvalidTokenInfoResponse } from "../durable_objects/polled_token_pair_list/actions/get_token_info";
import { getTokenInfo } from "../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { OpenPositionRequest } from "../durable_objects/user/actions/open_new_position";
import { AddressBookEntry, CompletedAddressBookEntry, JustAddressBookEntryID, JustAddressBookEntryName } from "../durable_objects/user/model/address_book_entry";
import { QuantityAndToken } from "../durable_objects/user/model/quantity_and_token";
import { TokenSymbolAndAddress } from "../durable_objects/user/model/token_name_and_address";
import { generateWallet, getAddressBookEntry, getAndMaybeInitializeUserData, getDefaultTrailingStopLoss, getPosition, getWalletData, listAddressBookEntries, listOpenTrailingStopLossPositions, manuallyClosePosition, maybeReadSessionObj, readSessionObj, requestNewPosition, storeAddressBookEntry, storeSessionObj, storeSessionObjProperty, storeSessionValues } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { logError } from "../logging";
import { BaseMenu, MenuBetaInviteFriends, MenuCode, MenuConfirmAddressBookEntry, MenuConfirmTrailingStopLossPositionRequest, MenuContinueMessage, MenuEditTrailingStopLossPositionRequest, MenuError, MenuFAQ, MenuHelp, MenuListPositions, MenuMain, MenuPickTransferFundsRecipient, MenuPleaseEnterToken, MenuPleaseWait, MenuStartTransferFunds, MenuTODO, MenuTrailingStopLossAutoRetrySell, MenuTrailingStopLossEntryBuyQuantity, MenuTrailingStopLossPickVsToken, MenuTrailingStopLossSlippagePercent, MenuTrailingStopLossTriggerPercent, MenuTransferFundsTestOrSubmitNow, MenuViewDecryptedWallet, MenuViewOpenPosition, MenuWallet, PositiveDecimalKeypad, PositiveIntegerKeypad } from "../menus";
import { PositionPreRequest, PositionRequest, convertPreRequestToRequest } from "../positions";
import { ReplyQuestion, ReplyQuestionCode } from "../reply_question";
import { SessionReplyQuestion } from "../reply_question/session_reply_question";
import { quoteBuy } from "../rpc/jupiter_quotes";
import { CompleteTransferFundsRequest, PartialTransferFundsRequest } from "../rpc/rpc_transfer_funds";
import { isGetQuoteFailure } from "../rpc/rpc_types";
import { AutoSellOrderSpec, TelegramWebhookInfo, deleteTGMessage, sendMessageToTG, sendRequestToTG, updateTGMessage } from "../telegram";
import { getVsTokenInfo } from "../tokens";
import { Structural, assertNever, makeFakeFailedRequestResponse, makeJSONResponse, makeSuccessResponse, tryParseFloat } from "../util";

export class Worker {

    async handleMessage(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
        
        // alias some things
        const telegramUserID = telegramWebhookInfo.telegramUserID;
        const chatID = telegramWebhookInfo.chatID;
        const initiatingMessageID = telegramWebhookInfo.messageID;
        const initiatingMessage = telegramWebhookInfo.text||'';
        
        // assume the message is a token address, and fetch the token info
        const validateTokenResponse : GetTokenInfoResponse = await getTokenInfo(initiatingMessage, env);
        
        // if it's not valid, early-out
        if (isInvalidTokenInfoResponse(validateTokenResponse)) {
            await sendMessageToTG(chatID, `The token address '${initiatingMessage}' is not a known token.`, env);
            return makeFakeFailedRequestResponse(404, "Token does not exist");
        }

        // otherwise, read the tokenInfo, and let the user know the token exists.
        const tokenInfo = validateTokenResponse.tokenInfo;
        const conversation = await sendMessageToTG(telegramWebhookInfo.chatID, `Token address '${tokenInfo.address}' (${tokenInfo.symbol}) recognized!`, env);
        if (!conversation.success) {
            return makeFakeFailedRequestResponse(500, "Failed to send response to telegram");
        }
        const conversationMessageID = conversation.messageID;

        // get default settings for a position request
        const r = await getDefaultTrailingStopLoss(telegramUserID, chatID, initiatingMessageID, validateTokenResponse.tokenInfo, env);
        const defaultTSL = r.prerequest;

        // create a 'prerequest' (with certain things missing that would be in a full request)
        const prerequest : PositionPreRequest = {
            positionID: randomUUID(),
            userID : telegramUserID,
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
        const quote = await quoteBuy(prerequest, tokenInfo, env);

        // if getting the quote fails, early-out
        if (isGetQuoteFailure(quote)) {
            await sendMessageToTG(chatID, `Could not get a quote for ${tokenInfo.symbol}.`, env);
            return makeFakeFailedRequestResponse(404, "Token does not exist");
        }

        // now that we have a quote and tokenInfo, convert the pre-request to a request
        const positionRequest = convertPreRequestToRequest(prerequest, quote, tokenInfo);

        // store the fully formed request in session, associated with the conversation.
        await storeSessionObj<PositionRequest>(telegramUserID, 
            conversationMessageID, 
            positionRequest, 
            "PositionRequest", 
            env);

        const menu = await this.makeStopLossRequestEditorMenu(positionRequest, env);
        const menuRequest = menu.getUpdateExistingMenuRequest(chatID, conversationMessageID, env);
        await fetch(menuRequest);

        return makeSuccessResponse();
    }

    async handleCallbackQuery(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
        const menuOrReplyQuestion = await this.handleCallbackQueryInternal(telegramWebhookInfo, env);
        if (menuOrReplyQuestion == null) {
            return makeSuccessResponse();
        }
        else if ('question' in menuOrReplyQuestion) {
            await menuOrReplyQuestion.sendReplyQuestion(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.chatID, env);
        }
        else {
            const menuDisplayRequest = menuOrReplyQuestion.getUpdateExistingMenuRequest(telegramWebhookInfo.chatID, telegramWebhookInfo.messageID, env);
            await sendRequestToTG(menuDisplayRequest!!);
        }
        return makeSuccessResponse();
    }

    // TODO: switch to handlers, factor handlers out into little classes (preferably into the menu classes themselves)
    async handleCallbackQueryInternal(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const telegramUserID = telegramWebhookInfo.telegramUserID;
        const messageID = telegramWebhookInfo.messageID;
        const chatID = telegramWebhookInfo.chatID;
        const callbackData = telegramWebhookInfo.callbackData!!;
        switch(callbackData.menuCode) {
            case MenuCode.Main:
                return this.createMainMenu(telegramWebhookInfo, env);
            case MenuCode.CreateWallet:
                await this.handleCreateWallet(telegramWebhookInfo, env);
                return this.createMainMenu(telegramWebhookInfo, env);
            case MenuCode.Error:
                return new MenuError(undefined);
            case MenuCode.ViewDecryptedWallet:
                const walletDataResponse = await getWalletData(telegramUserID, env);
                const decryptedPrivateKey = await decryptPrivateKey(walletDataResponse.wallet.encryptedPrivateKey, telegramUserID, env);
                return new MenuViewDecryptedWallet({ publicKey: walletDataResponse.wallet.publicKey, decryptedPrivateKey: decryptedPrivateKey })
            case MenuCode.FAQ:
                return new MenuFAQ(undefined);
            case MenuCode.Help:
                return new MenuHelp(undefined);
            case MenuCode.Invite:
                return this.TODOstubbedMenu(env);
            case MenuCode.PleaseEnterToken:
                return new MenuPleaseEnterToken(undefined);
            case MenuCode.ListPositions:
                const positions = await listOpenTrailingStopLossPositions(telegramUserID, env);
                return new MenuListPositions(positions);
            case MenuCode.ViewOpenPosition:
                const viewPositionID = callbackData.menuArg!!;
                const position = await getPosition(telegramUserID, viewPositionID, env);
                return new MenuViewOpenPosition(position);
            case MenuCode.ClosePositionManuallyAction:
                const closePositionID = callbackData.menuArg;
                if (closePositionID != null) {
                    await this.handleManuallyClosePosition(telegramUserID, closePositionID, env);
                }
                return this.createMainMenu(telegramWebhookInfo, env);
            case MenuCode.TrailingStopLossCustomSlippagePctKeypad:
                const trailingStopLossCustomSlippagePctKeypadEntry = callbackData.menuArg||''; 
                const trailingStopLossCustomSlippagePctKeypad = this.makeTrailingStopLossCustomSlippagePctKeypad(trailingStopLossCustomSlippagePctKeypadEntry);
                return trailingStopLossCustomSlippagePctKeypad;
            case MenuCode.TrailingStopLossCustomSlippagePctKeypadSubmit:
                const trailingStopLossCustomSlippageSubmittedKeypadEntry = tryParseFloat(callbackData.menuArg!!);
                if (trailingStopLossCustomSlippageSubmittedKeypadEntry) {
                    await storeSessionObjProperty(telegramUserID, messageID, "slippagePercent", trailingStopLossCustomSlippageSubmittedKeypadEntry, "PositionRequest", env);
                }
                const positionRequestAfterEditingSlippagePct = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                if (!trailingStopLossCustomSlippageSubmittedKeypadEntry) {
                    logError("Invalid slippage percent submitted", telegramWebhookInfo, trailingStopLossCustomSlippageSubmittedKeypadEntry);
                }
                return await this.makeStopLossRequestEditorMenu(positionRequestAfterEditingSlippagePct, env);                
            case MenuCode.TrailingStopLossEnterBuyQuantityKeypad:
                const buyTrailingStopLossQuantityKeypadEntry = callbackData.menuArg||'';
                const trailingStopLossEnterBuyQuantityKeypad = this.makeTrailingStopLossBuyQuantityKeypad(buyTrailingStopLossQuantityKeypadEntry);
                return trailingStopLossEnterBuyQuantityKeypad;
            case MenuCode.TrailingStopLossEnterBuyQuantitySubmit:
                const submittedTrailingStopLossBuyQuantity = tryParseFloat(callbackData.menuArg!!);
                if (submittedTrailingStopLossBuyQuantity) {
                    await storeSessionObjProperty(telegramUserID, messageID, "vsTokenAmt", submittedTrailingStopLossBuyQuantity, "PositionRequest", env);
                }
                const trailingStopLossRequestStateAfterBuyQuantityEdited = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                if (!submittedTrailingStopLossBuyQuantity) {
                    logError("Invalid buy quantity submitted", telegramWebhookInfo, trailingStopLossRequestStateAfterBuyQuantityEdited);
                }
                return await this.makeStopLossRequestEditorMenu(trailingStopLossRequestStateAfterBuyQuantityEdited, env);
            case MenuCode.TrailingStopLossChooseAutoRetrySellMenu:
                return new MenuTrailingStopLossAutoRetrySell(undefined);
            case MenuCode.TrailingStopLossChooseAutoRetrySellSubmit:
                await storeSessionObjProperty(telegramUserID, messageID, "retrySellIfSlippageExceeded", callbackData.menuArg === "true", "PositionRequest", env);
                const trailingStopLossRequestStateAfterAutoRetrySellEdited = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return await this.makeStopLossRequestEditorMenu(trailingStopLossRequestStateAfterAutoRetrySellEdited, env);
            case MenuCode.TrailingStopLossConfirmMenu:
                const trailingStopLossRequestAfterDoneEditing = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return await this.makeStopLossConfirmMenu(trailingStopLossRequestAfterDoneEditing, env);
            case MenuCode.TrailingStopLossCustomTriggerPercentKeypad:
                const trailingStopLossTriggerPercentKeypadCurrentEntry = callbackData.menuArg||'';
                const trailingStopLossCustomTriggerPercentKeypad = this.makeTrailingStopLossCustomTriggerPercentKeypad(trailingStopLossTriggerPercentKeypadCurrentEntry);
                return trailingStopLossCustomTriggerPercentKeypad;
            case MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit:
                const trailingStopLossCustomTriggerPercentSubmission = tryParseFloat(callbackData.menuArg!!);
                if (trailingStopLossCustomTriggerPercentSubmission) {
                    await storeSessionObjProperty(telegramUserID, messageID, "triggerPercent", trailingStopLossCustomTriggerPercentSubmission, "PositionRequest", env);
                }
                const trailingStopLossPositionRequestAfterEditingCustomTriggerPercent = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                if (!trailingStopLossCustomTriggerPercentSubmission) {
                    logError("Invalid trigger percent submitted", trailingStopLossCustomTriggerPercentSubmission, telegramWebhookInfo);
                }
                return await this.makeStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterEditingCustomTriggerPercent, env);                
            case MenuCode.TrailingStopLossEditorFinalSubmit:
                // TODO: do the read within UserDO to avoid the extra roundtrip
                const positionRequestAfterFinalSubmit = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                const positionRequestRequest : OpenPositionRequest = { 
                    chatID: chatID, 
                    userID: telegramUserID, 
                    positionRequest: positionRequestAfterFinalSubmit 
                };
                await requestNewPosition(telegramUserID, positionRequestRequest, env);
                return new MenuPleaseWait(undefined);
            case MenuCode.TrailingStopLossEntryBuyQuantityMenu:
                const quantityAndTokenForBuyQuantityMenu : QuantityAndToken = await this.getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramUserID, messageID, env);
                return new MenuTrailingStopLossEntryBuyQuantity(quantityAndTokenForBuyQuantityMenu);
            case MenuCode.TrailingStopLossPickVsTokenMenu:
                const trailingStopLossVsTokenNameAndAddress : TokenSymbolAndAddress = await this.getTrailingStopLossPositionVsTokenFromSession(telegramUserID, messageID, env);
                return new MenuTrailingStopLossPickVsToken(trailingStopLossVsTokenNameAndAddress);
            case MenuCode.TrailingStopLossPickVsTokenMenuSubmit:
                const trailingStopLossSelectedVsToken = callbackData.menuArg!!;
                const vsTokenAddress = getVsTokenInfo(trailingStopLossSelectedVsToken).address;
                const vsToken = getVsTokenInfo(trailingStopLossSelectedVsToken);
                await storeSessionValues(telegramUserID, messageID, new Map<string,Structural>([
                    ["vsToken", vsToken],
                    //["vsTokenAddress", vsTokenAddress]
                ]), "PositionRequest", env);
                const trailingStopLossPositionRequestAfterSubmittingVsToken = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return await this.makeStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterSubmittingVsToken, env);
            case MenuCode.TransferFunds:
                // TODO
                return this.TODOstubbedMenu(env);
            case MenuCode.Wallet:
                const walletDataForWalletMenu = await getWalletData(telegramUserID, env);
                const walletData = { address: walletDataForWalletMenu.wallet.publicKey };
                return new MenuWallet(walletData);
            case MenuCode.Close:
                await this.handleMenuClose(telegramWebhookInfo.chatID, telegramWebhookInfo.messageID, env);
                return;
            case MenuCode.TrailingStopLossSlippagePctMenu:
                const x = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                const slippagePercent = x.slippagePercent;
                return new MenuTrailingStopLossSlippagePercent(slippagePercent);
            case MenuCode.TrailingStopLossTriggerPercentMenu:
                const y = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                const triggerPercent = y.triggerPercent;
                return new MenuTrailingStopLossTriggerPercent(triggerPercent);
            case MenuCode.TrailingStopLossRequestReturnToEditorMenu:
                const z = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return await this.makeStopLossRequestEditorMenu(z, env);
            case MenuCode.AddFundsRecipientAddress:
                const addressBookEntry : AddressBookEntry = { 
                    addressBookEntryID : randomUUID()
                };
                await storeSessionObj<AddressBookEntry>(telegramUserID, messageID, addressBookEntry, "addressBookEntry", env);
                return new ReplyQuestion("Choose a name for this recipient", ReplyQuestionCode.EnterAddressBookEntryName, MenuCode.SubmitAddressBookEntryName, MenuCode.TransferFunds);
            case MenuCode.SubmitAddressBookEntryName:
                const addressBookEntry2 = await readSessionObj<JustAddressBookEntryID>(telegramUserID, messageID, "addressBookEntry", env);
                const addressBookEntry3 : JustAddressBookEntryName = { ...addressBookEntry2, name : callbackData.menuArg||'' } ;//name = callbackData.menuArg;
                await storeSessionObj<JustAddressBookEntryName>(telegramUserID, messageID, addressBookEntry3, "addressBookEntry", env);
                return new ReplyQuestion("Paste in the address", ReplyQuestionCode.EnterTransferFundsRecipient, MenuCode.SubmitAddressBookEntryAddress, MenuCode.TransferFunds);
            case MenuCode.SubmitAddressBookEntryAddress:
                const addressBookEntry4 = await readSessionObj<JustAddressBookEntryName>(telegramUserID, messageID, "addressBookEntry", env);
                const addressBookEntry5 : CompletedAddressBookEntry = { ...addressBookEntry4, address: callbackData.menuArg||'', confirmed : false };
                await storeSessionObj<CompletedAddressBookEntry>(telegramUserID, messageID, addressBookEntry5, "addressBookEntry", env);
                return new MenuConfirmAddressBookEntry(addressBookEntry5);
            case MenuCode.SubmitAddressBookEntry:
                const addressBookEntryFinal = await readSessionObj<CompletedAddressBookEntry>(telegramUserID, messageID, "addressBookEntry", env);
                const response = await storeAddressBookEntry(telegramUserID, addressBookEntryFinal, env);
                if (!response.success) {
                    return new MenuContinueMessage(`Could not store address book entry`, MenuCode.TransferFunds);
                }
                return new MenuStartTransferFunds(undefined);
            case MenuCode.PickTransferFundsRecipient:
                const addressBookEntries = await listAddressBookEntries(telegramUserID, env);
                return new MenuPickTransferFundsRecipient(addressBookEntries.addressBookEntries);
            case MenuCode.TransferFundsRecipientSubmitted:
                const addressBookId = callbackData.menuArg||'';
                const selectedAddressBookEntry = await getAddressBookEntry(telegramUserID, addressBookId, env);
                if (selectedAddressBookEntry == null) {
                    return new MenuContinueMessage(`Address book entry not found`, MenuCode.TransferFunds);
                }
                const partialTransferFundsRequest : PartialTransferFundsRequest = { recipientAddress: selectedAddressBookEntry.address };
                await storeSessionObj<PartialTransferFundsRequest>(telegramUserID, messageID, partialTransferFundsRequest, "transferFundsRequest", env);
                return new PositiveDecimalKeypad("${currentValue} SOL", MenuCode.KeypadTransferFundsQuantity, MenuCode.SubmitTransferFundsQuantity, MenuCode.TransferFunds, "1.0", 0.0);
            case MenuCode.KeypadTransferFundsQuantity:
                const tfEntry = callbackData.menuArg||'';
                return new PositiveDecimalKeypad("${currentValue} SOL", MenuCode.KeypadTransferFundsQuantity, MenuCode.SubmitTransferFundsQuantity, MenuCode.TransferFunds, tfEntry, 0.0);
            case MenuCode.SubmitTransferFundsQuantity:
                const tfQuantity = tryParseFloat(callbackData.menuArg||'');
                if (tfQuantity == null) {
                    return new MenuContinueMessage(`Invalid transfer funds quantity`, MenuCode.TransferFunds);
                }
                const tfFundsRequest = await readSessionObj<PartialTransferFundsRequest>(telegramUserID, messageID, "transferFundsRequest", env);
                const completeTfFundsRequest : CompleteTransferFundsRequest = { ...tfFundsRequest, solQuantity: tfQuantity };
                await storeSessionObj<CompleteTransferFundsRequest>(telegramUserID, messageID, completeTfFundsRequest, "transferFundsRequest", env);
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
                const unclaimedBetaCodes = await listUnclaimedBetaInviteCodes({ userID : telegramUserID }, env);
                if (!unclaimedBetaCodes.success) {
                    return this.createMainMenu(telegramWebhookInfo, env);
                }
                return new MenuBetaInviteFriends(unclaimedBetaCodes.data.betaInviteCodes);
            default:
                assertNever(callbackData.menuCode);
        }
    }

    private async createMainMenu(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<BaseMenu> {
        const userData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.telegramUserName, telegramWebhookInfo.messageID, env);
        return new MenuMain(userData);
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

    private async getTrailingStopLossPositionVsTokenFromSession(telegramUserID : number, messageID : number, env : Env) : Promise<TokenSymbolAndAddress> {
        const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
        return {
            tokenSymbol: positionRequest.vsToken.symbol,
            tokenAddress: positionRequest.vsToken.address
        };
    }

    private async getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramUserID : number, messageID : number, env: Env) : Promise<QuantityAndToken> {
        const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
        return {
            thisTokenSymbol:  positionRequest.vsToken.symbol,
            thisTokenAddress: positionRequest.vsToken.address,
            quantity: positionRequest.vsTokenAmt
        };
    }

    private async sendTrailingStopLossRequestToTokenPairPositionTracker(telegramUserID : number, trailingStopLossPositionRequest : OpenPositionRequest, env : Env) : Promise<void> {
        await requestNewPosition(telegramUserID, trailingStopLossPositionRequest, env);
    }

    private makeTrailingStopLossCustomTriggerPercentKeypad(currentValue : string) {
        return new PositiveIntegerKeypad(
            "${currentValue}%", // intentional double quotes - syntax is parsed later
            MenuCode.TrailingStopLossCustomTriggerPercentKeypad,
            MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit,
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

    private makeTrailingStopLossCustomSlippagePctKeypad(currentEntry : string) {
        return new PositiveIntegerKeypad("${currentValue}%", // intentional double quotes - syntax is parsed later
            MenuCode.TrailingStopLossCustomSlippagePctKeypad,
            MenuCode.TrailingStopLossCustomSlippagePctKeypadSubmit,
            MenuCode.TrailingStopLossRequestReturnToEditorMenu,
            currentEntry,
            0,
            100);
    }

    private makeTrailingStopLossBuyQuantityKeypad(currentEntry : string) {
        return new PositiveDecimalKeypad("${currentValue}",  // intentional double quotes - syntax is parsed later
            MenuCode.TrailingStopLossEnterBuyQuantityKeypad, 
            MenuCode.TrailingStopLossEnterBuyQuantitySubmit, 
            MenuCode.TrailingStopLossRequestReturnToEditorMenu,
            currentEntry, 
            0);
    }

    private TODOstubbedMenu(env : Env) : BaseMenu {
        return new MenuTODO(undefined);
    }

    private async handleManuallyClosePosition(telegramUserID : number, positionID : string, env : Env) : Promise<Response> {
        const result = await manuallyClosePosition(telegramUserID, positionID, env);
        return makeSuccessResponse();
    }

    private async handleCreateWallet(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
        const responseBody = await generateWallet(telegramWebhookInfo.telegramUserID, env);
        // todo: handle error case.
        return makeJSONResponse(responseBody);
    }

    // TODO: this is a total mess
    async handleCommand(telegramWebhookInfo : TelegramWebhookInfo, env: any) : Promise<Response> {
        const command = telegramWebhookInfo.command!!;
        const tgMessage = await sendMessageToTG(telegramWebhookInfo.chatID, 'Processing command', env);
        if (!tgMessage.success) {
            return makeSuccessResponse();
        }
        const conversationMessageID = tgMessage.messageID;
        const [commandTextResponse,menu,storeSessionObjectRequest] = await this.handleCommandInternal(command, telegramWebhookInfo, conversationMessageID, env);
        const tgMessageInfo = await updateTGMessage(telegramWebhookInfo.chatID, conversationMessageID, commandTextResponse, env);
        if (!tgMessageInfo.success) {
            return makeSuccessResponse();
        }
        if (storeSessionObjectRequest != null) {
            await storeSessionObj(telegramWebhookInfo.telegramUserID, conversationMessageID, storeSessionObjectRequest.obj, storeSessionObjectRequest.prefix, env);
        }
        if (menu != null) {
            const menuDisplayRequest = menu.getUpdateExistingMenuRequest(telegramWebhookInfo.chatID, conversationMessageID, env);
            fetch(menuDisplayRequest);
        }
        return makeSuccessResponse();
    }

    async handleReplyToBot(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
        const telegramUserID = telegramWebhookInfo.telegramUserID;
        const messageID = telegramWebhookInfo.messageID;
        const replyQuestion = await maybeReadSessionObj<SessionReplyQuestion>(telegramUserID, messageID, "replyQuestion", env);
        if (replyQuestion == null) {
            return makeSuccessResponse();
        }
        const replyQuestionCode = replyQuestion.replyQuestionCode;
        switch(replyQuestionCode) {
            case ReplyQuestionCode.EnterBetaInviteCode:
                return this.handleEnterBetaInviteCode(telegramWebhookInfo, env);
            case ReplyQuestionCode.EnterTransferFundsRecipient:
                throw new Error("");
            case ReplyQuestionCode.EnterAddressBookEntryName:
                throw new Error("");
            default:
                assertNever(replyQuestionCode);
        }
    }

    async handleEnterBetaInviteCode(telegramWebhookInfo: TelegramWebhookInfo, env : Env) : Promise<Response> {
        const code = (telegramWebhookInfo.text||'').trim().toUpperCase();
        // operation is idempotent.  effect of operation is in .status of response
        const claimInviteCodeResponse = await claimInviteCode({ userID : telegramWebhookInfo.telegramUserID, inviteCode: code }, env);
        if (claimInviteCodeResponse.status === 'already-claimed-by-you') {
            await sendMessageToTG(telegramWebhookInfo.chatID, `You have already claimed this invite code and are good to go!`, env);
        }
        else if (claimInviteCodeResponse.status === 'firsttime-claimed-by-you') {
            // greet the new user
            await this.sendUserWelcomeScreen(telegramWebhookInfo, env);
        }
        else if (claimInviteCodeResponse.status === 'claimed-by-someone-else') {
            // tell user sorry, code is already claimed
            await sendMessageToTG(telegramWebhookInfo.chatID, `Sorry ${telegramWebhookInfo.telegramUserName} - this invite code has already been claimed by someone else.`, env);
        }
        else if (claimInviteCodeResponse.status === 'code-does-not-exist') {
            // tell user sorry, that's not a real code
            await sendMessageToTG(telegramWebhookInfo.chatID, `Sorry ${telegramWebhookInfo.telegramUserName} - '${code}' is not a known invite code.`, env);
        }
        return makeSuccessResponse();
    }

    private async sendUserWelcomeScreen(telegramWebhookInfo : TelegramWebhookInfo, env : Env) {
        // TODO: actual welcome screen
        const request = new MenuTODO(undefined).getCreateNewMenuRequest(telegramWebhookInfo.chatID, env);
        await fetch(request);
    }

    private async handleCommandInternal(command : string, telegramWebhookInfo : TelegramWebhookInfo, messageID : number, env : Env) : Promise<[string,BaseMenu?,{ obj : any, prefix : string }?]> {
        switch(command) {
            case '/start':
                const userData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.telegramUserName, telegramWebhookInfo.messageID, env);
                return ["...", new MenuMain(userData)];
            case '/help':
                return ["...", new MenuHelp(undefined)];
            case '/autosell':
                const autoSellOrderSpec = telegramWebhookInfo.parseAutoSellOrder();
                if (autoSellOrderSpec == null) {
                    const autosellBadFormatMsg = `Auto-Sell order specification is incorrect.  Correct format is: ${AutoSellOrderSpec.describeFormat()}`;
                    return [autosellBadFormatMsg];
                }
                const tokenAddress = autoSellOrderSpec.tokenAddress;
                const getTokenResponse = await getTokenInfo(tokenAddress, env);
                if (isInvalidTokenInfoResponse(getTokenResponse)) {
                    const autosellTokenDNEMsg = `Could not identify token '${tokenAddress}'`;
                    return [autosellTokenDNEMsg];
                }
                const tokenInfo = getTokenResponse.tokenInfo;
                const tokenRecognizedForAutoSellOrderMsg =  `Token address '${tokenAddress}' (${tokenInfo.symbol}) recognized!`;
                const prerequest = autoSellOrderSpec.toPositionPreRequest();
                const quote = await quoteBuy(prerequest, tokenInfo, env);
                if (isGetQuoteFailure(quote)) {
                    return [`Unable to get a quote for ${tokenInfo.symbol}`];
                }
                const positionRequest = convertPreRequestToRequest(prerequest, quote, tokenInfo);
                positionRequest.messageID = messageID; // ugh hack.
                return [tokenRecognizedForAutoSellOrderMsg,
                    await this.makeStopLossRequestEditorMenu(positionRequest, env),
                    { obj: prerequest, prefix: "PositionRequest" }];
            case '/menu':
                const menuUserData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.telegramUserName, telegramWebhookInfo.messageID, env);
                return ['...', new MenuMain(menuUserData)];
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