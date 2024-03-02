
/* Durable Objects */
import { makeFakeFailedRequestResponse, makeJSONResponse, makeSuccessResponse } from "./http_helpers";
import { MenuMain } from "./menu_main";

/* Wrangler requires these to be re-exported for the DO to work */
import { UserDO } from "./user_DO";
import { TokenPairPositionTrackerDO } from "./token_pair_position_tracker_DO";
import { PolledTokenPairListDO } from "./polled_token_pair_list_DO";

/* Utility Stuff */
import { 
	Result, 
	ERRORS,  
	Env,
	WalletData,
	LongTrailingStopLossPositionRequest,
	QuantityAndToken,
	TokenNameAndAddress,
	DeleteSessionRequest,
	SessionValue
} from "./common";

/* Type per menu (that's why there's so many) */
import { MenuError } from "./menu_error";
import { MenuFAQ } from "./menu_faq";
import { MenuHelp } from "./menu_help";
import { MenuPleaseEnterToken } from "./menu_please_enter_token";
import { MenuListPositions } from "./menu_list_positions";
import { MenuViewOpenPosition } from "./menu_view_open_position";
import { MenuViewWallet } from "./menu_view_wallet";
import { PositiveIntegerKeypad } from "./positive_integer_keypad";
import { MenuTODO } from "./todo_menu";
import { MenuConfirmTrailingStopLossPositionRequest } from "./menu_confirm_trailing_stop_loss_position_request";
import { PositiveDecimalKeypad } from "./positive_decimal_keypad";
import { MenuEditTrailingStopLossPositionRequest } from "./menu_edit_trailing_stop_loss_position_request";
import { MenuTrailingStopLossAutoRetrySell } from "./menu_trailing_stop_loss_auto_retry_sell";
import { MenuTrailingStopLossEntryBuyQuantity } from "./menu_trailing_stop_loss_entry_buy_quantity";
import { MenuTrailingStopLossPickVsToken } from "./menu_trailing_stop_loss_pick_vs_token";
import { MenuWallet } from "./menu_wallet";
import { BaseMenu, MenuCode } from "./menu";
import { deleteTGMessage, sendMessageToTG, sendRequestToTG } from "./telegram_helpers";
import { AutoSellOrderSpec, TelegramWebhookInfo } from "./telegram_webhook_info";
import { UserDOFetchMethod, createWallet, getAndMaybeInitializeUserData, getDefaultTrailingStopLoss, getPosition, listOpenTrailingStopLossPositions, makeUserDOFetchRequest, manuallyClosePosition, readSessionObj, requestNewPosition, storeSessionObj, storeSessionObjProperty, storeSessionValues } from "./userDO_interop";
import { ValidateTokenResponse, validateToken } from "./polled_token_pair_list_DO_interop";
import { getVsTokenAddress, getVsTokenName } from "./vs_tokens";
import { MenuTrailingStopLossSlippagePercent } from "./menu_trailing_stop_loss_slippage_percent";
import { MenuTrailingStopLossTriggerPercent } from "./menu_trailing_stop_loss_trigger_percent";

/* Export of imported DO's (required by wrangler) */
export { UserDO, TokenPairPositionTrackerDO, PolledTokenPairListDO }

/**
 * Worker
 */
export default {
	async fetch(req : Request, env : Env) {
		try {
			const response = await this._fetch(req, env);
			if (!response) {
				this.logWebhookRequestFailure(req, ERRORS.NO_RESPONSE, {});
				return makeFakeFailedRequestResponse(500);
			}
			return response;
		}
		catch(e : any) {
			this.logWebhookRequestFailure(req, ERRORS.UNHANDLED_EXCEPTION, { "e": e.toString() });
			return makeFakeFailedRequestResponse(500); // 500 is stored in statusText, status is still 200
		}
	},

	async _fetch(req : Request, env : Env) : Promise<Response> {

		// First, validate that this req is coming from the telegram bot's webhook by checking secret key.
		const webhookRequestValidation = this.validateRequest(req,env);
		if (!webhookRequestValidation.ok) {
			this.logWebhookRequestFailure(req,webhookRequestValidation.message, {});
			return this.makeResponseToSuspiciousWebhookRequest();
		}

		// Parse JSON from request
		let telegramRequestBody = null;
		try {
			telegramRequestBody = await this.parseRequestBody(req,env);
		}
		catch(e) {
			this.logWebhookRequestFailure(req, ERRORS.COULDNT_PARSE_REQUEST_BODY_JSON, {});
			return makeFakeFailedRequestResponse(400);
		}

		const telegramWebhookInfo = new TelegramWebhookInfo(telegramRequestBody);
		
		// User clicks a menu button
		if (telegramWebhookInfo.messageType === 'callback') {
			return await this.handleCallbackQuery(telegramWebhookInfo, env);
		}

		// User issues a command
		if (telegramWebhookInfo.messageType === 'command') {
			return await this.handleCommand(telegramWebhookInfo, env);
		}
		
		// User types a message
		if (telegramWebhookInfo.messageType === 'message') {
			return await this.handleMessage(telegramWebhookInfo, env);
		}
		
		// Never send anything but a 200 back to TG ---- otherwise telegram will keep trying to resend
		return makeSuccessResponse();
	},

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
			const token = validateTokenResponse.token;
			const defaultTrailingStopLossRequest = await getDefaultTrailingStopLoss(telegramUserID, validateTokenResponse.token!!, validateTokenResponse.tokenAddress!!, env);
			// send out a 'stub' message that will be updated as the request editor menu.
			const tgMessageInfo = await sendMessageToTG(telegramWebhookInfo.chatID, `Token address '${tokenAddress}' (${token}) recognized!`, env);
			await storeSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, tgMessageInfo.messageID!!, defaultTrailingStopLossRequest, "LongTrailingStopLossPositionRequest", env);
			const menu = this.makeTrailingStopLossRequestEditorMenu(defaultTrailingStopLossRequest);
			const request = menu.getUpdateExistingMenuRequest(chatID, tgMessageInfo.messageID!!, env);
			await fetch(request);
			return makeSuccessResponse();
		}
		return makeSuccessResponse();
	},

	async handleCallbackQuery(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
		const menu = await this.handleCallbackQueryInternal(telegramWebhookInfo, env);
		if (menu != null) {
			const menuDisplayRequest = menu.getUpdateExistingMenuRequest(telegramWebhookInfo.chatID, telegramWebhookInfo.messageID, env);
			await sendRequestToTG(menuDisplayRequest!!);
		}
		return makeSuccessResponse();
	},

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
				await storeSessionObjProperty(telegramUserID, messageID, "slippagePercent", trailingStopLossCustomSlippageSubmittedKeypadEntry, "LongTrailingStopLossPositionRequest", env);
				const positionRequestAfterEditingSlippagePct = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				return this.makeTrailingStopLossRequestEditorMenu(positionRequestAfterEditingSlippagePct)
			case MenuCode.TrailingStopLossEnterBuyQuantityKeypad:
				const buyTrailingStopLossQuantityKeypadEntry = callbackData.menuArg||'';
				const trailingStopLossEnterBuyQuantityKeypad = this.makeTrailingStopLossBuyQuantityKeypad(buyTrailingStopLossQuantityKeypadEntry);
				return trailingStopLossEnterBuyQuantityKeypad;
			case MenuCode.TrailingStopLossEnterBuyQuantitySubmit:
				const submittedTrailingStopLossBuyQuantity = callbackData.menuArg!!;
				await storeSessionObjProperty(telegramUserID, messageID, "vsTokenAmt", parseFloat(submittedTrailingStopLossBuyQuantity), "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossRequestStateAfterBuyQuantityEdited = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				return this.makeTrailingStopLossRequestEditorMenu(trailingStopLossRequestStateAfterBuyQuantityEdited);
			case MenuCode.TrailingStopLossChooseAutoRetrySellMenu:
				return new MenuTrailingStopLossAutoRetrySell();
			case MenuCode.TrailingStopLossChooseAutoRetrySellSubmit:
				await storeSessionObjProperty(telegramUserID, messageID, "retrySellIfSlippageExceeded", callbackData.menuArg!! === "true", "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossRequestStateAfterAutoRetrySellEdited = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				return this.makeTrailingStopLossRequestEditorMenu(trailingStopLossRequestStateAfterAutoRetrySellEdited);
			case MenuCode.TrailingStopLossConfirmMenu:
				const trailingStopLossRequestAfterDoneEditing = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				return new MenuConfirmTrailingStopLossPositionRequest(trailingStopLossRequestAfterDoneEditing);
			case MenuCode.TrailingStopLossCustomTriggerPercentKeypad:
				const trailingStopLossTriggerPercentKeypadCurrentEntry = callbackData.menuArg||'';
				const trailingStopLossCustomTriggerPercentKeypad = this.makeTrailingStopLossCustomTriggerPercentKeypad(trailingStopLossTriggerPercentKeypadCurrentEntry)
				return trailingStopLossCustomTriggerPercentKeypad;
			case MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit:
				const trailingStopLossCustomTriggerPercentSubmission = callbackData.menuArg!!;
				await storeSessionObjProperty(telegramUserID, messageID, "triggerPercent", parseFloat(trailingStopLossCustomTriggerPercentSubmission), "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossPositionRequestAfterEditingCustomTriggerPercent = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				return this.makeTrailingStopLossRequestEditorMenu(trailingStopLossPositionRequestAfterEditingCustomTriggerPercent);
			case MenuCode.TrailingStopLossEditorFinalSubmit:
				// TODO: do the read within UserDO to avoid the extra roundtrip
				const trailingStopLossRequestAfterFinalSubmit = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				await this.sendTrailingStopLossRequestToTokenPairPositionTracker(telegramUserID, trailingStopLossRequestAfterFinalSubmit, env);
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
				//await storeSessionObjProperty(telegramUserID, messageID, "vsTokenAddress", vsTokenAddress, "LongTrailingStopLossPositionRequest", env);
				await storeSessionValues(telegramUserID, messageID, new Map<string,SessionValue>([
					["vsToken", trailingStopLossSelectedVsToken],
					["vsTokenAddress", vsTokenAddress]
				]), "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossPositionRequestAfterSubmittingVsToken = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
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
				const x = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				const slippagePercent = x.slippagePercent;
				return new MenuTrailingStopLossSlippagePercent(slippagePercent);
			case MenuCode.TrailingStopLossTriggerPercentMenu:
				const y = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				const triggerPercent = y.triggerPercent;
				return new MenuTrailingStopLossTriggerPercent(triggerPercent);
			case MenuCode.TrailingStopLossRequestReturnToEditorMenu:
				const z = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				return this.makeTrailingStopLossRequestEditorMenu(z);
			default:
				return new MenuError();
		}
	},

	async createMainMenu(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<BaseMenu> {
		const userData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.telegramUserName, telegramWebhookInfo.messageID, env);
		return new MenuMain(userData);
	},

	async handleMenuClose(chatID : number, messageID : number, env : Env) : Promise<Response> {
		const result = await deleteTGMessage(messageID, chatID, env);
		if (!result.success) {
			return makeFakeFailedRequestResponse(500, "Couldn't delete message");
		}
		else {
			return makeSuccessResponse();
		}
	},

	async deleteSessionFromUserDO(messageID : number) : Promise<Response> {
		const deleteSessionRequestBody : DeleteSessionRequest = { messageID: messageID };
		const request = makeUserDOFetchRequest(UserDOFetchMethod.deleteSession, deleteSessionRequestBody);
		return await fetch(request);
	},

	async getTrailingStopLossPositionVsTokenFromSession(telegramUserID : number, messageID : number, env : Env) : Promise<TokenNameAndAddress> {
		const positionRequest = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
		return {
			token: getVsTokenName(positionRequest.vsTokenAddress)!!,
			tokenAddress: positionRequest.vsTokenAddress
		};
	},

	async getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramUserID : number, messageID : number, env: Env) : Promise<QuantityAndToken> {
		const positionRequest = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
		return {
			thisToken:  getVsTokenName(positionRequest.vsToken)!!,
			thisTokenAddress: positionRequest.vsTokenAddress,
			quantity: positionRequest.vsTokenAmt
		};
	},

	async sendTrailingStopLossRequestToTokenPairPositionTracker(telegramUserID : number, trailingStopLossPositionRequest : LongTrailingStopLossPositionRequest, env : Env) : Promise<void> {
		await requestNewPosition(telegramUserID, trailingStopLossPositionRequest, env);
	},

	makeTrailingStopLossCustomTriggerPercentKeypad(currentValue : string) {
		return new PositiveIntegerKeypad(
			"${currentValue}",
			MenuCode.TrailingStopLossCustomTriggerPercentKeypad,
			MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit,
			MenuCode.TrailingStopLossRequestReturnToEditorMenu,
			currentValue,
			1,
			100);
	},

	makeTrailingStopLossRequestEditorMenu(positionRequest : LongTrailingStopLossPositionRequest) : BaseMenu {
		return new MenuEditTrailingStopLossPositionRequest(positionRequest);
	},

	makeTrailingStopLossCustomSlippagePctKeypad(currentEntry : string) {
		return new PositiveIntegerKeypad("${currentValue}%",
			MenuCode.TrailingStopLossCustomSlippagePctKeypad,
			MenuCode.TrailingStopLossCustomSlippagePctKeypadSubmit,
			MenuCode.TrailingStopLossRequestReturnToEditorMenu,
			currentEntry,
			0,
			100);
	},

	makeTrailingStopLossBuyQuantityKeypad(currentEntry : string) {
		return new PositiveDecimalKeypad("${currentValue}", 
			MenuCode.TrailingStopLossEnterBuyQuantityKeypad, 
			MenuCode.TrailingStopLossEnterBuyQuantitySubmit, 
			MenuCode.TrailingStopLossRequestReturnToEditorMenu,
			currentEntry, 
			0);
	},

	TODOstubbedMenu(env : Env) : BaseMenu {
		return new MenuTODO();
	},

	async handleManuallyClosePosition(telegramUserID : number, positionID : string, env : Env) : Promise<Response> {
		const result = await manuallyClosePosition(telegramUserID, positionID, env);
		return makeSuccessResponse();
	},

	async handleCreateWallet(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
		const responseBody = await createWallet(telegramWebhookInfo.telegramUserID, env);
		return makeJSONResponse(responseBody);
	},

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
	},

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
				const tokenInfo = await validateToken(tokenAddress, env);
				if (tokenInfo.type !== 'valid') {
					const autosellTokenDNEMsg = `Could not identify token '${tokenAddress}'`;
					return [autosellTokenDNEMsg];
				}
				const tokenRecognizedForAutoSellOrderMsg =  `Token address '${tokenAddress}' (${tokenInfo.token!!}) recognized!`;
				const positionRequest = autoSellOrderSpec.toPositionRequest();
				return [tokenRecognizedForAutoSellOrderMsg,
					this.makeTrailingStopLossRequestEditorMenu(positionRequest),
					{ obj: positionRequest, prefix: "LongTrailingStopLossPositionRequest" }];
			case '/menu':
				const menuUserData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, telegramWebhookInfo.telegramUserName, telegramWebhookInfo.messageID, env);
				return ['...', new MenuMain(menuUserData)];
			default:
				throw new Error(`Unrecognized command: ${command}`);
		}
	},

	async parseRequestBody(req : Request, env : Env) : Promise<any> {
		const requestBody = await req.json();
		return requestBody;
	},

	validateRequest(req : Request, env : Env) : Result<boolean> {
		const requestSecretToken = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
		const secretTokensMatch = (requestSecretToken === env.TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN);
		if (!secretTokensMatch) {
			return Result.failure(ERRORS.MISMATCHED_SECRET_TOKEN);
		}
		return Result.success(true);
	},

	logWebhookRequestFailure(req : Request, error_code : ERRORS | string | undefined, addl_info_obj : any) {
		const ip_address = this.ip_address_of(req);
		const addl_info = JSON.stringify(addl_info_obj || {}, null, 0);
		const error_code_string = (error_code || '').toString();
		console.log(`${ip_address} :: ${error_code_string} :: ${addl_info}`);
	},

	makeResponseToSuspiciousWebhookRequest() : Response {
		// 403, forbidden
		const response = new Response(null, {
			status: 403
		});
		return response;
	},


	ip_address_of(req : Request) : string {
		const ip = req.headers.get('cf-connecting-ip');
		const forwarded_ip = req.headers.get('x-forwarded-for');
		return `${ip}->${forwarded_ip}`;
	},

	logFailedParseChatInfoFromWebhookRequest(req : Request, parseChatInfoFailureReason : string) {
		const ip_address = this.ip_address_of(req);
		console.log(`${ip_address} :: ${parseChatInfoFailureReason}`);
	},

	makeResponseToChatInfoParseFailure() : Response {
		// 400, bad request
		const response = new Response(null, {
			status: 200, // Annoyingly, bot server will retry requests indefinetely if it gets response out of range of 200-299
			statusText: "400"
		});
		return response;
	},

	async getWalletData() : Promise<WalletData> {
		// TODO
		return {
			purchasingPowerSOL: 0.0,
			purchasingPowerUSDC: 0.0,
			solValue: 0.0,
			usdcValue: 0.0
		};
	},
};