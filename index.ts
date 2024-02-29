
/* Durable Objects */
import { makeFakeFailedRequestResponse, makeJSONRequest, makeJSONResponse, makeSuccessResponse } from "./http_helpers";
import { MenuMain } from "./menu_main";

/* Wrangler requires these to be re-exported for the DO to work */
import { UserDO } from "./user_DO";
import { TokenPairPositionTrackerDO } from "./token_pair_position_tracker_DO";
import { PolledTokenPairListDO } from "./polled_token_pair_list_DO";

/* Utility Stuff */
import { 
	Result, 
	ERRORS, 
	UserData, 
	Env,
	WalletData,
	SessionKey,
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
import { BaseMenu, MenuCode, MenuDisplayMode } from "./menu";
import { deleteTGMessage, sendMessageToTG } from "./telegram_helpers";
import { TelegramWebhookInfo } from "./telegram_webhook_info";
import { UserDOFetchMethod, createWallet, getAndMaybeInitializeUserData, getPosition, makeUserDOFetchRequest, manuallyClosePosition, readSessionObj, requestNewPosition, storeSessionObj, storeSessionObjProperty, storeSessionValues } from "./userDO_interop";
import { ValidateTokenResponse, validateToken } from "./polled_token_pair_list_DO_interop";
import { getVsTokenAddress, getVsTokenName } from "./vs_tokens";

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
		const userData = await getAndMaybeInitializeUserData(telegramWebhookInfo.telegramUserID, 
			telegramWebhookInfo.telegramUserName, 
			telegramWebhookInfo.messageID, 
			env);
		
		// User clicks a menu button
		if (telegramWebhookInfo.messageType === 'callback') {
			return await this.handleCallbackQuery(telegramWebhookInfo, userData, env);
		}

		// User issues a command
		if (telegramWebhookInfo.messageType === 'command') {
			return await this.handleCommand(telegramWebhookInfo, userData, env);
		}		
		
		// User types a message
		if (telegramWebhookInfo.messageType === 'message') {
			return await this.handleMessage(telegramWebhookInfo, env);
		}
		
		// Never send anything but a 200 back to TG ---- otherwise telegram will keep trying to resend
		return makeSuccessResponse();
	},

	async handleMessage(telegramWebhookInfo : TelegramWebhookInfo, env : Env) {
		const tokenAddress = telegramWebhookInfo.text!!;
		const validateTokenResponse : ValidateTokenResponse = await validateToken(tokenAddress, env);
		if (validateTokenResponse.type == 'invalid') {
			await sendMessageToTG(telegramWebhookInfo.chatID, `The token address '${tokenAddress}' is not a known token.`, env);
			return makeFakeFailedRequestResponse(404, "Token does not exist");
		}
		else if (validateTokenResponse.type === 'tryagain') {
			await sendMessageToTG(telegramWebhookInfo.chatID, `We could not determine if '${tokenAddress}' is a valid token.  Try again soon.`, env);
			return makeFakeFailedRequestResponse(500, "Could not determine if token exists");
		}
		else if (validateTokenResponse.type === 'valid') {
			await sendMessageToTG(telegramWebhookInfo.chatID, `Token address '${tokenAddress}' recognized!`, env);
			//await this.sendDefaultTrailingStopLossOrderRequestEditor(validateTokenResponse, telegramWebhookInfo, userData, env);
			return makeSuccessResponse();
		}
		return makeSuccessResponse();
	},

	async handleCallbackQuery(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env : Env) {

		/* Create menu based on user response and user state */
		const callbackData = telegramWebhookInfo.callbackData!!;

		let menu  : BaseMenu|null  = null;

		const telegramUserID = telegramWebhookInfo.telegramUserID;
		const messageID  = telegramWebhookInfo.messageID;

		switch(callbackData.menuCode) {
			case MenuCode.Main:
				menu = new MenuMain(telegramWebhookInfo, userData, userData.hasWallet);
				break;
			case MenuCode.CreateWallet:
				const createWalletResponse = await this.handleCreateWallet(telegramWebhookInfo, env);
				if (createWalletResponse.ok) {
					menu = new MenuMain(telegramWebhookInfo, userData, true);
				}
				else {
					menu = new MenuError(telegramWebhookInfo, userData);
				}
				break;
			case MenuCode.Error:
				menu = new MenuError(telegramWebhookInfo, userData);
				break;
			case MenuCode.ExportWallet:
				menu = this.TODOstubbedMenu(telegramWebhookInfo, userData, env);	
				break;
			case MenuCode.FAQ:
				menu = new MenuFAQ(telegramWebhookInfo, userData);
				break;
			case MenuCode.Help:
				menu = new MenuHelp(telegramWebhookInfo, userData);
				break;
			case MenuCode.Invite:
				menu = this.TODOstubbedMenu(telegramWebhookInfo, userData, env);
				break;
			case MenuCode.PleaseEnterToken:
				menu = new MenuPleaseEnterToken(telegramWebhookInfo, userData);
				break;
			case MenuCode.ListPositions:
				menu = new MenuListPositions(telegramWebhookInfo, userData);
				break;
			case MenuCode.ViewOpenPosition:
				const viewPositionID = callbackData.menuArg!!;
				const position = await getPosition(telegramUserID, viewPositionID, env);
				menu = new MenuViewOpenPosition(telegramWebhookInfo, userData, position);
				break;
			case MenuCode.ClosePositionManuallyAction:
				const closePositionID = callbackData.menuArg;
				if (closePositionID != null) {
					await this.handleManuallyClosePosition(telegramUserID, closePositionID, env);
				}
				menu = new MenuMain(telegramWebhookInfo, userData, userData.hasWallet);
				break;
			case MenuCode.RefreshWallet:
				const walletData = await this.getWalletData();
				menu = new MenuViewWallet(telegramWebhookInfo, userData, walletData);
				break;
			case MenuCode.TrailingStopLossCustomSlippagePctKeypad:
				const trailingStopLossCustomSlippagePctKeypadEntry = callbackData.menuArg||''; 
				const trailingStopLossCustomSlippagePctKeypad = this.makeTrailingStopLossCustomSlippagePctKeypad(trailingStopLossCustomSlippagePctKeypadEntry, telegramWebhookInfo, userData, env);
				menu = trailingStopLossCustomSlippagePctKeypad;
				break;
			case MenuCode.TrailingStopLossCustomSlippagePctKeypadSubmit:
				const trailingStopLossCustomSlippageSubmittedKeypadEntry = callbackData.menuArg!!;
				await storeSessionObjProperty(telegramUserID, messageID, "slippagePercent", trailingStopLossCustomSlippageSubmittedKeypadEntry, "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossPositionRequestToConfirm = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				menu = new MenuConfirmTrailingStopLossPositionRequest(telegramWebhookInfo, userData, trailingStopLossPositionRequestToConfirm);
				break;
			case MenuCode.TrailingStopLossEnterBuyQuantityKeypad:
				const buyTrailingStopLossQuantityKeypadEntry = callbackData.menuArg||'';
				const trailingStopLossEnterBuyQuantityKeypad = this.makeTrailingStopLossBuyQuantityKeypad(buyTrailingStopLossQuantityKeypadEntry, telegramWebhookInfo, userData, env);
				menu = trailingStopLossEnterBuyQuantityKeypad;
				break;
			case MenuCode.TrailingStopLossEnterBuyQuantitySubmit:
				const submittedTrailingStopLossBuyQuantity = callbackData.menuArg!!;
				await storeSessionObjProperty(telegramUserID, messageID, "vsTokenAmt", parseFloat(submittedTrailingStopLossBuyQuantity), "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossRequestStateAfterBuyQuantityEdited = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, trailingStopLossRequestStateAfterBuyQuantityEdited);
				break;
			case MenuCode.TrailingStopLossChooseAutoRetrySellMenu:
				menu = new MenuTrailingStopLossAutoRetrySell(telegramWebhookInfo, userData);
				break;
			case MenuCode.TrailingStopLossChooseAutoRetrySellSubmit:
				await storeSessionObjProperty(telegramUserID, messageID, "retrySellIfPartialFill", callbackData.menuArg!! === "true", "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossRequestStateAfterAutoRetrySellEdited = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, trailingStopLossRequestStateAfterAutoRetrySellEdited);
				break;
			case MenuCode.TrailingStopLossConfirmMenu:
				const trailingStopLossRequestAfterDoneEditing = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				menu = new MenuConfirmTrailingStopLossPositionRequest(telegramWebhookInfo, userData, trailingStopLossRequestAfterDoneEditing);
				break;
			case MenuCode.TrailingStopLossCustomTriggerPercentKeypad:
				const trailingStopLossTriggerPercentKeypadCurrentEntry = callbackData.menuArg||'';
				const trailingStopLossCustomTriggerPercentKeypad = this.makeTrailingStopLossCustomTriggerPercentKeypad(telegramWebhookInfo, userData, trailingStopLossTriggerPercentKeypadCurrentEntry)
				menu = trailingStopLossCustomTriggerPercentKeypad;
				break;
			case MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit:
				const trailingStopLossCustomTriggerPercentSubmission = callbackData.menuArg!!;
				await storeSessionObjProperty(telegramUserID, messageID, "triggerPercent", parseFloat(trailingStopLossCustomTriggerPercentSubmission), "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossPositionRequestAfterEditingCustomTriggerPercent = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, trailingStopLossPositionRequestAfterEditingCustomTriggerPercent);
				break;
			case MenuCode.TrailingStopLossEditorFinalSubmit:
				// TODO: do the read within UserDO to avoid the extra roundtrip
				const trailingStopLossRequestAfterFinalSubmit = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				await this.sendTrailingStopLossRequestToTokenPairPositionTracker(telegramUserID, trailingStopLossRequestAfterFinalSubmit, env);
				menu = new MenuMain(telegramWebhookInfo, userData, userData.hasWallet);
				break;
			case MenuCode.TrailingStopLossEntryBuyQuantityMenu:
				const quantityAndTokenForBuyQuantityMenu : QuantityAndToken = await this.getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramUserID, messageID, env);
				menu = new MenuTrailingStopLossEntryBuyQuantity(telegramWebhookInfo, userData, quantityAndTokenForBuyQuantityMenu);
				break;
			case MenuCode.TrailingStopLossPickVsTokenMenu:
				const trailingStopLossVsTokenNameAndAddress : TokenNameAndAddress = await this.getTrailingStopLossPositionVsTokenFromSession(telegramUserID, messageID, env);
				menu = new MenuTrailingStopLossPickVsToken(telegramWebhookInfo, userData, trailingStopLossVsTokenNameAndAddress);
				break;
			case MenuCode.TrailingStopLossPickVsTokenMenuSubmit:
				const trailingStopLossSelectedVsToken = callbackData.menuArg!!;
				const vsTokenAddress = getVsTokenAddress(trailingStopLossSelectedVsToken);
				await storeSessionObjProperty(telegramUserID, messageID, "vsTokenAddress", vsTokenAddress, "LongTrailingStopLossPositionRequest", env);
				const trailingStopLossPositionRequestAfterSubmittingVsToken = await readSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, "LongTrailingStopLossPositionRequest", env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, trailingStopLossPositionRequestAfterSubmittingVsToken);
				break;
			case MenuCode.TransferFunds:
				// TODO
				menu = this.TODOstubbedMenu(telegramWebhookInfo, userData, env);
				break;
			case MenuCode.Wallet:
				const walletDataForWalletMenu = await this.getWalletData();
				menu = new MenuWallet(telegramWebhookInfo, userData, walletDataForWalletMenu);
				break;
			case MenuCode.Close:
				return await this.handleMenuClose(telegramWebhookInfo, env);
			default:
				menu = new MenuError(telegramWebhookInfo, userData);
				break;
		}
		const menuDisplayRequest = menu.createMenuDisplayRequest(MenuDisplayMode.UpdateMenu, env);
		return await this.sendRequestToTG(menuDisplayRequest!!);
	},

	async sendRequestToTG(request : Request) : Promise<Response> {
		return await fetch(request!!).then(async (response) => {
			if (!response.ok) {
				const tgDescription = await this.tryGetTGDescription(response);
				return makeFakeFailedRequestResponse(500, response.statusText, tgDescription);
			}
			else {
				return makeSuccessResponse();
			}
		})
	},

	async handleMenuClose(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
		const messageID = telegramWebhookInfo.messageID;
		const result = await deleteTGMessage(messageID, env);
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


	async tryGetTGDescription(response : Response) : Promise<string|undefined> {
		try {
			const responseBody : any = await response.json();
			return responseBody.description;
		}
		catch {
			return undefined;
		}
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
		requestNewPosition(telegramUserID, trailingStopLossPositionRequest, env);
	},

	makeTrailingStopLossCustomTriggerPercentKeypad(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, currentValue : string) {
		return new PositiveIntegerKeypad(
			telegramWebhookInfo, 
			userData, 
			"${currentValue}",
			MenuCode.TrailingStopLossCustomTriggerPercentKeypad,
			MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit,
			currentValue,
			1,
			100);
	},

	makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, positionRequest : LongTrailingStopLossPositionRequest) : BaseMenu {
		return new MenuEditTrailingStopLossPositionRequest(telegramWebhookInfo, userData, positionRequest);
	},

	makeTrailingStopLossCustomSlippagePctKeypad(currentEntry : string, telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env: Env) {
		return new PositiveIntegerKeypad(
			telegramWebhookInfo, 
			userData, 
			"${currentValue}%",
			MenuCode.TrailingStopLossCustomSlippagePctKeypad,
			MenuCode.TrailingStopLossCustomSlippagePctKeypadSubmit,
			currentEntry,
			0,
			100);
	},

	makeTrailingStopLossBuyQuantityKeypad(currentEntry : string, telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env : Env) {
		return new PositiveDecimalKeypad(
			telegramWebhookInfo, 
			userData, 
			"${currentValue}", 
			MenuCode.TrailingStopLossEnterBuyQuantityKeypad, 
			MenuCode.TrailingStopLossEnterBuyQuantitySubmit, 
			currentEntry, 
			0);
	},

	TODOstubbedMenu(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env : Env) : BaseMenu {
		return new MenuTODO(telegramWebhookInfo, userData);
	},

	async handleManuallyClosePosition(telegramUserID : number, positionID : string, env : Env) : Promise<Response> {
		const result = await manuallyClosePosition(telegramUserID, positionID, env);
		return makeSuccessResponse();
	},

	async handleCreateWallet(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
		const responseBody = await createWallet(telegramWebhookInfo.telegramUserID, env);
		return makeJSONResponse(responseBody);
	},

	async handleCommand(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env: any) : Promise<Response> {
		const command = telegramWebhookInfo.command!!;
		const telegramUserID = telegramWebhookInfo.telegramUserID;
		const messageID = telegramWebhookInfo.messageID;
		let menu : BaseMenu|null = null;// : Request|null = null;
		switch(command) {
			case '/start':
				menu = new MenuMain(telegramWebhookInfo, userData, userData.hasWallet);
				break;
			case '/help':
				menu = new MenuHelp(telegramWebhookInfo, userData);
				break;
			case '/autosell':
				const autoSellOrderSpec = telegramWebhookInfo.parseAutoSellOrder();
				if (autoSellOrderSpec == null) {
					await sendMessageToTG(telegramWebhookInfo.chatID, 'Auto-Sell order specification is incorrect.  Correct format is: ${AutoSellOrderSpec.describeFormat()}', env);
					return makeFakeFailedRequestResponse(400, "Incorrect auto-sell format specified");
				}
				const tokenAddress = autoSellOrderSpec.tokenAddress;
				const tokenInfo = await validateToken(tokenAddress, env);
				if (tokenInfo.type !== 'valid') {
					await sendMessageToTG(telegramWebhookInfo.chatID, "Could not identify token '${tokenAddress}'", env);
					return makeFakeFailedRequestResponse(404, 'Unknown token address');
				}
				const positionRequest = autoSellOrderSpec.toPositionRequest();
				const response = await storeSessionObj<LongTrailingStopLossPositionRequest>(telegramUserID, messageID, positionRequest, "LongTrailingStopLossPositionRequest", env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, positionRequest);
				break;
			case '/menu':
				menu = new MenuMain(telegramWebhookInfo, userData, userData.hasWallet);
				break;
			default:
				throw new Error(`Unrecognized command: ${command}`);
		}
		const menuDisplayRequest = menu.createMenuDisplayRequest(MenuDisplayMode.NewMenu, env);
		fetch(menuDisplayRequest);
		return makeSuccessResponse();
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