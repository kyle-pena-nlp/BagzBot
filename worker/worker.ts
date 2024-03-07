import { QuantityAndToken, TokenNameAndAddress, WalletData } from "../common";
import { ValidateTokenResponse, validateToken } from "../durable_objects/polled_token_pair_list/polled_token_pair_list_DO_interop";
import { SessionValue } from "../durable_objects/user/model/session";
import { createWallet, getAndMaybeInitializeUserData, getDefaultTrailingStopLoss, getPosition, listOpenTrailingStopLossPositions, manuallyClosePosition, readSessionObj, requestNewPosition, storeSessionObj, storeSessionObjProperty, storeSessionValues } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { PositionRequest } from "../positions/positions";
import { deleteTGMessage, sendMessageToTG, sendRequestToTG } from "../telegram/telegram_helpers";
import { AutoSellOrderSpec, TelegramWebhookInfo } from "../telegram/telegram_webhook_info";
import { getVsTokenAddress, getVsTokenName } from "../tokens/vs_tokens";
import { makeFakeFailedRequestResponse, makeJSONResponse, makeSuccessResponse } from "../util/http_helpers";
import { BaseMenu, MenuCode, MenuConfirmTrailingStopLossPositionRequest, MenuEditTrailingStopLossPositionRequest, MenuError, MenuFAQ, MenuHelp, MenuListPositions, MenuMain, MenuPleaseEnterToken, MenuTODO, MenuTrailingStopLossAutoRetrySell, MenuTrailingStopLossEntryBuyQuantity, MenuTrailingStopLossPickVsToken, MenuTrailingStopLossSlippagePercent, MenuTrailingStopLossTriggerPercent, MenuViewOpenPosition, MenuViewWallet, MenuWallet, PositiveDecimalKeypad, PositiveIntegerKeypad } from "../menus";

export class Worker {


    async handleMessage(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
        const telegramUserID = telegramWebhookInfo.telegramUserID;
        const chatID = telegramWebhookInfo.chatID;
        const tokenAddress = telegramWebhookInfo.text!!;
        const validateTokenResponse : ValidateTokenResponse = await validateToken(tokenAddress, env);
        if (validateTokenResponse.type === 'invalid') {
            await sendMessageToTG(chatID, `The token address '${tokenAddress}' is not a known token.`, env);
            return makeFakeFailedRequestResponse(404, "Token does not exist");
        }
        else if (validateTokenResponse.type === 'valid') {
            const defaultTrailingStopLossRequest = await getDefaultTrailingStopLoss(telegramUserID, chatID, validateTokenResponse.tokenInfo!!, env);
            // send out a 'stub' message that will be updated as the request editor menu.
            const tokenAddress = validateTokenResponse.tokenInfo!!.address;
            const tokenSymbol  = validateTokenResponse.tokenInfo!!.symbol;
            const tgMessageInfo = await sendMessageToTG(telegramWebhookInfo.chatID, `Token address '${tokenAddress}' (${tokenSymbol}) recognized!`, env);
            await storeSessionObj<PositionRequest>(telegramUserID, tgMessageInfo.messageID!!, defaultTrailingStopLossRequest, "PositionRequest", env);
            const menu = this.makeTrailingStopLossRequestEditorMenu(defaultTrailingStopLossRequest);
            const request = menu.getUpdateExistingMenuRequest(chatID, tgMessageInfo.messageID!!, env);
            await fetch(request);
            return makeSuccessResponse();
        }
        return makeSuccessResponse();
    }

    async handleCallbackQuery(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
        const menu = await this.handleCallbackQueryInternal(telegramWebhookInfo, env);
        if (menu != null) {
            const menuDisplayRequest = menu.getUpdateExistingMenuRequest(telegramWebhookInfo.chatID, telegramWebhookInfo.messageID, env);
            await sendRequestToTG(menuDisplayRequest!!);
        }
        return makeSuccessResponse();
    }

    async handleCallbackQueryInternal(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<BaseMenu|void> {
        const telegramUserID = telegramWebhookInfo.telegramUserID;
        const messageID = telegramWebhookInfo.messageID;
        const callbackData = telegramWebhookInfo.callbackData!!;switch(callbackData.menuCode) {
            case MenuCode.Main:
                return this.createMainMenu(telegramWebhookInfo, env);
            case MenuCode.CreateWallet:
                await this.handleCreateWallet(telegramWebhookInfo, env);
                return this.createMainMenu(telegramWebhookInfo, env);
            case MenuCode.Error:
                return new MenuError();
            case MenuCode.ExportWallet:
                return this.TODOstubbedMenu(env);	
            case MenuCode.FAQ:
                return new MenuFAQ();
            case MenuCode.Help:
                return new MenuHelp();
            case MenuCode.Invite:
                return this.TODOstubbedMenu(env);
            case MenuCode.PleaseEnterToken:
                return new MenuPleaseEnterToken();
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
            case MenuCode.RefreshWallet:
                const walletData = await this.getWalletData();
                return new MenuViewWallet(walletData);
            case MenuCode.TrailingStopLossCustomSlippagePctKeypad:
                const trailingStopLossCustomSlippagePctKeypadEntry = callbackData.menuArg||''; 
                const trailingStopLossCustomSlippagePctKeypad = this.makeTrailingStopLossCustomSlippagePctKeypad(trailingStopLossCustomSlippagePctKeypadEntry);
                return trailingStopLossCustomSlippagePctKeypad;
            case MenuCode.TrailingStopLossCustomSlippagePctKeypadSubmit:
                const trailingStopLossCustomSlippageSubmittedKeypadEntry = callbackData.menuArg!!;
                await storeSessionObjProperty(telegramUserID, messageID, "slippagePercent", trailingStopLossCustomSlippageSubmittedKeypadEntry, "PositionRequest", env);
                const positionRequestAfterEditingSlippagePct = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return this.makeTrailingStopLossRequestEditorMenu(positionRequestAfterEditingSlippagePct)
            case MenuCode.TrailingStopLossEnterBuyQuantityKeypad:
                const buyTrailingStopLossQuantityKeypadEntry = callbackData.menuArg||'';
                const trailingStopLossEnterBuyQuantityKeypad = this.makeTrailingStopLossBuyQuantityKeypad(buyTrailingStopLossQuantityKeypadEntry);
                return trailingStopLossEnterBuyQuantityKeypad;
            case MenuCode.TrailingStopLossEnterBuyQuantitySubmit:
                const submittedTrailingStopLossBuyQuantity = callbackData.menuArg!!;
                await storeSessionObjProperty(telegramUserID, messageID, "vsTokenAmt", parseFloat(submittedTrailingStopLossBuyQuantity), "PositionRequest", env);
                const trailingStopLossRequestStateAfterBuyQuantityEdited = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return this.makeTrailingStopLossRequestEditorMenu(trailingStopLossRequestStateAfterBuyQuantityEdited);
            case MenuCode.TrailingStopLossChooseAutoRetrySellMenu:
                return new MenuTrailingStopLossAutoRetrySell();
            case MenuCode.TrailingStopLossChooseAutoRetrySellSubmit:
                await storeSessionObjProperty(telegramUserID, messageID, "retrySellIfSlippageExceeded", callbackData.menuArg!! === "true", "PositionRequest", env);
                const trailingStopLossRequestStateAfterAutoRetrySellEdited = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return this.makeTrailingStopLossRequestEditorMenu(trailingStopLossRequestStateAfterAutoRetrySellEdited);
            case MenuCode.TrailingStopLossConfirmMenu:
                const trailingStopLossRequestAfterDoneEditing = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return new MenuConfirmTrailingStopLossPositionRequest(trailingStopLossRequestAfterDoneEditing);
            case MenuCode.TrailingStopLossCustomTriggerPercentKeypad:
                const trailingStopLossTriggerPercentKeypadCurrentEntry = callbackData.menuArg||'';
                const trailingStopLossCustomTriggerPercentKeypad = this.makeTrailingStopLossCustomTriggerPercentKeypad(trailingStopLossTriggerPercentKeypadCurrentEntry)
                return trailingStopLossCustomTriggerPercentKeypad;
            case MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit:
                const trailingStopLossCustomTriggerPercentSubmission = callbackData.menuArg!!;
                await storeSessionObjProperty(telegramUserID, messageID, "triggerPercent", parseFloat(trailingStopLossCustomTriggerPercentSubmission), "PositionRequest", env);
                const trailingStopLossPositionRequestAfterEditingCustomTriggerPercent = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return this.makeTrailingStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterEditingCustomTriggerPercent);
            case MenuCode.TrailingStopLossEditorFinalSubmit:
                // TODO: do the read within UserDO to avoid the extra roundtrip
                const trailingStopLossRequestAfterFinalSubmit = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                await requestNewPosition(telegramUserID, trailingStopLossRequestAfterFinalSubmit, env);
                // TODO: post-confirm screen
                return this.createMainMenu(telegramWebhookInfo, env);
            case MenuCode.TrailingStopLossEntryBuyQuantityMenu:
                const quantityAndTokenForBuyQuantityMenu : QuantityAndToken = await this.getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramUserID, messageID, env);
                return new MenuTrailingStopLossEntryBuyQuantity(quantityAndTokenForBuyQuantityMenu);
            case MenuCode.TrailingStopLossPickVsTokenMenu:
                const trailingStopLossVsTokenNameAndAddress : TokenNameAndAddress = await this.getTrailingStopLossPositionVsTokenFromSession(telegramUserID, messageID, env);
                return new MenuTrailingStopLossPickVsToken(trailingStopLossVsTokenNameAndAddress);
            case MenuCode.TrailingStopLossPickVsTokenMenuSubmit:
                const trailingStopLossSelectedVsToken = callbackData.menuArg!!;
                const vsTokenAddress = getVsTokenAddress(trailingStopLossSelectedVsToken);
                //await storeSessionObjProperty(telegramUserID, messageID, "vsTokenAddress", vsTokenAddress, "PositionRequest", env);
                await storeSessionValues(telegramUserID, messageID, new Map<string,SessionValue>([
                    ["vsToken", trailingStopLossSelectedVsToken],
                    ["vsTokenAddress", vsTokenAddress]
                ]), "PositionRequest", env);
                const trailingStopLossPositionRequestAfterSubmittingVsToken = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
                return this.makeTrailingStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterSubmittingVsToken);
            case MenuCode.TransferFunds:
                // TODO
                return this.TODOstubbedMenu(env);
            case MenuCode.Wallet:
                const walletDataForWalletMenu = await this.getWalletData();
                return new MenuWallet(walletDataForWalletMenu);
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
                return this.makeTrailingStopLossRequestEditorMenu(z);
            default:
                return new MenuError();
        }
    }

    async createMainMenu(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<BaseMenu> {
        const userData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.telegramUserName, telegramWebhookInfo.messageID, env);
        return new MenuMain(userData);
    }

    async handleMenuClose(chatID : number, messageID : number, env : Env) : Promise<Response> {
        const result = await deleteTGMessage(messageID, chatID, env);
        if (!result.success) {
            return makeFakeFailedRequestResponse(500, "Couldn't delete message");
        }
        else {
            return makeSuccessResponse();
        }
    }

    async getTrailingStopLossPositionVsTokenFromSession(telegramUserID : number, messageID : number, env : Env) : Promise<TokenNameAndAddress> {
        const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
        return {
            token: getVsTokenName(positionRequest.vsTokenAddress)!!,
            tokenAddress: positionRequest.vsTokenAddress
        };
    }

    async getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramUserID : number, messageID : number, env: Env) : Promise<QuantityAndToken> {
        const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, messageID, "PositionRequest", env);
        return {
            thisToken:  getVsTokenName(positionRequest.vsToken.address)!!,
            thisTokenAddress: positionRequest.vsTokenAddress,
            quantity: positionRequest.vsTokenAmt
        };
    }

    async sendTrailingStopLossRequestToTokenPairPositionTracker(telegramUserID : number, trailingStopLossPositionRequest : PositionRequest, env : Env) : Promise<void> {
        await requestNewPosition(telegramUserID, trailingStopLossPositionRequest, env);
    }

    makeTrailingStopLossCustomTriggerPercentKeypad(currentValue : string) {
        return new PositiveIntegerKeypad(
            "${currentValue}",
            MenuCode.TrailingStopLossCustomTriggerPercentKeypad,
            MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit,
            MenuCode.TrailingStopLossRequestReturnToEditorMenu,
            currentValue,
            1,
            100);
    }

    makeTrailingStopLossRequestEditorMenu(positionRequest : PositionRequest) : BaseMenu {
        return new MenuEditTrailingStopLossPositionRequest(positionRequest);
    }

    makeTrailingStopLossCustomSlippagePctKeypad(currentEntry : string) {
        return new PositiveIntegerKeypad("${currentValue}%",
            MenuCode.TrailingStopLossCustomSlippagePctKeypad,
            MenuCode.TrailingStopLossCustomSlippagePctKeypadSubmit,
            MenuCode.TrailingStopLossRequestReturnToEditorMenu,
            currentEntry,
            0,
            100);
    }

    makeTrailingStopLossBuyQuantityKeypad(currentEntry : string) {
        return new PositiveDecimalKeypad("${currentValue}", 
            MenuCode.TrailingStopLossEnterBuyQuantityKeypad, 
            MenuCode.TrailingStopLossEnterBuyQuantitySubmit, 
            MenuCode.TrailingStopLossRequestReturnToEditorMenu,
            currentEntry, 
            0);
    }

    TODOstubbedMenu(env : Env) : BaseMenu {
        return new MenuTODO();
    }

    async handleManuallyClosePosition(telegramUserID : number, positionID : string, env : Env) : Promise<Response> {
        const result = await manuallyClosePosition(telegramUserID, positionID, env);
        return makeSuccessResponse();
    }

    async handleCreateWallet(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
        const responseBody = await createWallet(telegramWebhookInfo.telegramUserID, env);
        return makeJSONResponse(responseBody);
    }

    async handleCommand(telegramWebhookInfo : TelegramWebhookInfo, env: any) : Promise<Response> {
        const command = telegramWebhookInfo.command!!;
        const [commandTextResponse,menu,storeSessionObjectRequest] = await this.handleCommandInternal(command, telegramWebhookInfo, env);
        const tgMessageInfo = await sendMessageToTG(telegramWebhookInfo.chatID, commandTextResponse, env);
        if (storeSessionObjectRequest != null) {
            await storeSessionObj(telegramWebhookInfo.telegramUserID, tgMessageInfo.messageID!!, storeSessionObjectRequest.obj, storeSessionObjectRequest.prefix, env)
        }
        if (menu != null) {
            const menuDisplayRequest = menu.getUpdateExistingMenuRequest(telegramWebhookInfo.chatID, tgMessageInfo.messageID!!, env);
            fetch(menuDisplayRequest);
        }
        return makeSuccessResponse();
    }

    async handleCommandInternal(command : string, telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<[string,BaseMenu?,{ obj : any, prefix : string }?]> {
        switch(command) {
            case '/start':
                const userData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.telegramUserName, telegramWebhookInfo.messageID, env);
                return ["...", new MenuMain(userData)];
            case '/help':
                return ["...", new MenuHelp()];
            case '/autosell':
                const autoSellOrderSpec = telegramWebhookInfo.parseAutoSellOrder();
                if (autoSellOrderSpec == null) {
                    const autosellBadFormatMsg = `Auto-Sell order specification is incorrect.  Correct format is: ${AutoSellOrderSpec.describeFormat()}`;
                    return [autosellBadFormatMsg];
                }
                const tokenAddress = autoSellOrderSpec.tokenAddress;
                const validateTokenResponse = await validateToken(tokenAddress, env);
                if (validateTokenResponse.type !== 'valid') {
                    const autosellTokenDNEMsg = `Could not identify token '${tokenAddress}'`;
                    return [autosellTokenDNEMsg];
                }
                const tokenInfo = validateTokenResponse.tokenInfo!!;
                const tokenRecognizedForAutoSellOrderMsg =  `Token address '${tokenAddress}' (${tokenInfo.symbol!!}) recognized!`;
                const positionRequest = autoSellOrderSpec.toPositionRequest();
                return [tokenRecognizedForAutoSellOrderMsg,
                    this.makeTrailingStopLossRequestEditorMenu(positionRequest),
                    { obj: positionRequest, prefix: "PositionRequest" }];
            case '/menu':
                const menuUserData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.telegramUserName, telegramWebhookInfo.messageID, env);
                return ['...', new MenuMain(menuUserData)];
            default:
                throw new Error(`Unrecognized command: ${command}`);
        }
    }

    
	async getWalletData() : Promise<WalletData> {
		// TODO
		return {
			purchasingPowerSOL: 0.0,
			purchasingPowerUSDC: 0.0,
			solValue: 0.0,
			usdcValue: 0.0
		};
	}

}