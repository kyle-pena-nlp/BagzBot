
/* Durable Objects */
import { DurableObjectNamespace } from "@cloudflare/workers-types";
import { makeFakeFailedRequestResponse, makeJSONRequest, makeSuccessResponse } from "./http_helpers";
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
	UserInitializeRequest,
	Env,
	Position,
	GetPositionRequest,
	ClosePositionsRequest,
	WalletData,
	SessionKey,
	GetSessionValuesRequest,
	SessionValuesResponse,
	LongTrailingStopLossPositionRequest,
	PositionType,
	QuantityAndToken,
	TokenNameAndAddress,
	getVsTokenAddress,
	VsToken,
	StoreSessionValuesRequest,
	DeleteSessionRequest} from "./common";

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
import { makeTelegramBotUrl, makeTelegramSendMessageRequest } from "./telegram_helpers";
import { TelegramWebhookInfo } from "./telegram_webhook_info";
import { UserDOFetchMethod, makeUserDOFetchRequest } from "./userDO_interop";
import { PolledTokenPairListDOFetchMethod, ValidateTokenRequest, ValidateTokenResponse, makePolledTokenPairListDOFetchRequest } from "./polled_token_pair_list_DO_interop";

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

	async _fetch(req : Request, env : Env) {

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

		// Get some data
		const telegramWebhookInfo = new TelegramWebhookInfo(telegramRequestBody);
		const userData = await this.getAndMaybeInitializeUserData(telegramWebhookInfo, env);
		
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
			return await this.handleMessage(telegramWebhookInfo, userData, env);
		}
		
		// Never send anything but a 200 back to TG ---- otherwise telegram will keep trying to resend
		return this.makeSuccessRequestResponse();
	},


	async getAndMaybeInitializeUserData(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<UserData> {
		const userDO = this.getUserDO(telegramWebhookInfo, env);
		return this.getUserDataFromUserDO(userDO, telegramWebhookInfo.messageID).then(async (userData) => {
			if (userData.initialized) {
				return userData;
			}
			else {
				return await this.initializeAndReturnUserDO(telegramWebhookInfo, userDO);
			}
		});
	},

	async initializeAndReturnUserDO(telegramWebhookInfo : TelegramWebhookInfo, userDO : any) : Promise<UserData> {		
		const userInitializeRequest : UserInitializeRequest = {
			durableObjectID: userDO.id.toString(),
			telegramUserID : telegramWebhookInfo.telegramUserID,
			telegramUserName : telegramWebhookInfo.telegramUserName
		};
		const initializeResponse = await fetch(makeUserDOFetchRequest(UserDOFetchMethod.initialize, userInitializeRequest));
		if (!initializeResponse.ok) {
			throw new Error("Could not initialized user");
		}
		// now that we are initialized, re-fetch the userData
		const messageID = telegramWebhookInfo.messageID;
		return await this.getUserDataFromUserDO(userDO, messageID);		
	},

	getUserDO(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : any {
		const userDONamespace : DurableObjectNamespace = env.UserDO;
		const userDODurableObjectID = userDONamespace.idFromName(telegramWebhookInfo.telegramUserID.toString());
		const userDO = userDONamespace.get(userDODurableObjectID);
		return userDO;
	},

	async getUserDataFromUserDO(userDO : any, messageID : number) : Promise<UserData> {
		const request = makeUserDOFetchRequest(UserDOFetchMethod.get, { messageID : messageID });
		const userDOGetResponse = await userDO.fetch(request);
		if (!userDOGetResponse.ok) {
			throw new Error("Could not retrieve User Data");
		}
		const userData : UserData = await userDOGetResponse.json();
		return userData;
	},

	async handleMessage(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env : Env) {
		const tokenAddress = telegramWebhookInfo.text!!;
		const tokenValidationRequest : ValidateTokenRequest = { tokenAddress : tokenAddress };
		const userDORequest = makePolledTokenPairListDOFetchRequest(PolledTokenPairListDOFetchMethod.validateToken, tokenValidationRequest);
		const response = (await this.getPolledTokenPairListDO(env).fetch(userDORequest)) as Response;
		const validateTokenResponse : ValidateTokenResponse = (await response.json()) as ValidateTokenResponse;
		if (validateTokenResponse.type == 'invalid') {
			await this.sendMessageToTG(telegramWebhookInfo.chatID, `The token address '${tokenAddress}' is not a known token.`, env);
			return makeFakeFailedRequestResponse(404, "Token does not exist");
		}
		else if (validateTokenResponse.type === 'tryagain') {
			await this.sendMessageToTG(telegramWebhookInfo.chatID, `We could not determine if '${tokenAddress}' is a valid token.  Try again soon.`, env);
			return makeFakeFailedRequestResponse(500, "Could not determine if token exists");
		}
		else  if (validateTokenResponse.type === 'valid') {
			await this.sendMessageToTG(telegramWebhookInfo.chatID, `Token address '${tokenAddress}' recognized!`, env);
			return makeSuccessResponse();
		}
		return makeSuccessResponse();
		/*const x ={
			positionID : crypto.randomUUID(),
			type: PositionType.LongTrailingStopLoss,
			token : telegramWebhookInfo.text!!,
			tokenAddress: 'fakeTokenAddress',
			vsToken : 'SOL',
			vsTokenAddress: 'fakeSOLAddress',
			vsTokenAmt : 1.0,
			triggerPercent : 5,
			slippagePercent: 0.5,
			retrySellIfPartialFill : true
		}
		const sessionValues = this.convertLongTrailingStopLossRequestToSessionValues(positionRequest);
		await this.storeSessionStates(telegramWebhookInfo.messageID, sessionValues, telegramWebhookInfo, env);
		const menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, positionRequest);
		const menuDisplayRequest = menu.createMenuDisplayRequest(MenuDisplayMode.NewMenu, env);
		fetch(menuDisplayRequest).then((response) => {
			if (!response.ok) {
				return makeFakeFailedRequestResponse(500, 'Failed to display request editor menu');
			}
			else {
				return makeSuccessResponse();
			}
		})*/
	},

	async sendMessageToTG(chatID : number, text : string, env : Env) {
		const request = makeTelegramSendMessageRequest(chatID, text, env);
		return await fetch(request);
	},

	getPolledTokenPairListDO(env : Env) : any {
		const namespace = env.PolledTokenPairListDO as DurableObjectNamespace;
		const id = namespace.idFromName('singleton');
		const durableObject = namespace.get(id);
		return durableObject;
	},

	convertLongTrailingStopLossRequestToSessionValues(positionRequest : LongTrailingStopLossPositionRequest) : Map<SessionKey,boolean|number|string|null> {
		const sessionValues = new Map<SessionKey,boolean|number|string|null>([
			[SessionKey.PositionID, positionRequest.positionID],
			[SessionKey.PositionType, positionRequest.type.toString()],
			[SessionKey.Token, positionRequest.token],
			[SessionKey.TokenAddress, positionRequest.tokenAddress],
			[SessionKey.VsToken, positionRequest.vsToken],
			[SessionKey.VsTokenAddress, positionRequest.vsTokenAddress],
			[SessionKey.VsTokenAmt, positionRequest.vsTokenAmt],
			[SessionKey.TrailingStopLossTriggerPercent, positionRequest.triggerPercent],
			[SessionKey.TrailingStopLossSlippagePct, positionRequest.slippagePercent],
			[SessionKey.TrailingStopLossRetrySellIfPartialFill, positionRequest.retrySellIfPartialFill]
		]);
		return sessionValues;
	},

	async handleCallbackQuery(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env : Env) {

		/* Create menu based on user response and user state */
		const callbackData = telegramWebhookInfo.callbackData!!;

		let menu  : BaseMenu|null  = null;

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
				const position = await this.getPosition(viewPositionID, telegramWebhookInfo, env);
				menu = new MenuViewOpenPosition(telegramWebhookInfo, userData, position);
				break;
			case MenuCode.ClosePositionManuallyAction:
				const closePositionID = callbackData.menuArg;
				if (closePositionID != null) {
					await this.handleManuallyClosePosition(closePositionID, telegramWebhookInfo, env);
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
				await this.storeSessionState(telegramWebhookInfo.messageID, SessionKey.TrailingStopLossSlippagePct, trailingStopLossCustomSlippageSubmittedKeypadEntry, telegramWebhookInfo, env);
				const trailingStopLossPositionRequestToConfirm = await this.getTrailingStopLossPositionRequestFromSession(telegramWebhookInfo, env);
				menu = new MenuConfirmTrailingStopLossPositionRequest(telegramWebhookInfo, userData, trailingStopLossPositionRequestToConfirm);
				break;
			case MenuCode.TrailingStopLossEnterBuyQuantityKeypad:
				const buyTrailingStopLossQuantityKeypadEntry = callbackData.menuArg||'';
				const trailingStopLossEnterBuyQuantityKeypad = this.makeTrailingStopLossBuyQuantityKeypad(buyTrailingStopLossQuantityKeypadEntry, telegramWebhookInfo, userData, env);
				menu = trailingStopLossEnterBuyQuantityKeypad;
				break;
			case MenuCode.TrailingStopLossEnterBuyQuantitySubmit:
				const submittedTrailingStopLossBuyQuantity = callbackData.menuArg!!;
				await this.storeSessionState(telegramWebhookInfo.messageID, SessionKey.VsTokenAmt, parseFloat(submittedTrailingStopLossBuyQuantity), telegramWebhookInfo, env);
				const trailingStopLossRequestStateAfterBuyQuantityEdited = await this.getTrailingStopLossPositionRequestFromSession(telegramWebhookInfo, env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, trailingStopLossRequestStateAfterBuyQuantityEdited);
				break;
			case MenuCode.TrailingStopLossChooseAutoRetrySellMenu:
				menu = new MenuTrailingStopLossAutoRetrySell(telegramWebhookInfo, userData);
				break;
			case MenuCode.TrailingStopLossChooseAutoRetrySellSubmit:
				await this.storeSessionState(telegramWebhookInfo.messageID, SessionKey.TrailingStopLossRetrySellIfPartialFill, callbackData.menuArg!! === "true", telegramWebhookInfo, env);
				const trailingStopLossRequestStateAfterAutoRetrySellEdited = await this.getTrailingStopLossPositionRequestFromSession(telegramWebhookInfo, env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, trailingStopLossRequestStateAfterAutoRetrySellEdited);
				break;
			case MenuCode.TrailingStopLossConfirmMenu:
				const trailingStopLossRequestAfterDoneEditing = await this.getTrailingStopLossPositionRequestFromSession(telegramWebhookInfo, env);
				menu = new MenuConfirmTrailingStopLossPositionRequest(telegramWebhookInfo, userData, trailingStopLossRequestAfterDoneEditing);
				break;
			case MenuCode.TrailingStopLossCustomTriggerPercentKeypad:
				const trailingStopLossTriggerPercentKeypadCurrentEntry = callbackData.menuArg||'';
				const trailingStopLossCustomTriggerPercentKeypad = this.makeTrailingStopLossCustomTriggerPercentKeypad(telegramWebhookInfo, userData, trailingStopLossTriggerPercentKeypadCurrentEntry)
				menu = trailingStopLossCustomTriggerPercentKeypad;
				break;
			case MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit:
				const trailingStopLossCustomTriggerPercentSubmission = callbackData.menuArg!!;
				await this.storeSessionState(telegramWebhookInfo.messageID, SessionKey.TrailingStopLossTriggerPercent, parseFloat(trailingStopLossCustomTriggerPercentSubmission), telegramWebhookInfo, env);
				const trailingStopLossPositionRequestAfterEditingCustomTriggerPercent = await this.getTrailingStopLossPositionRequestFromSession(telegramWebhookInfo, env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, trailingStopLossPositionRequestAfterEditingCustomTriggerPercent);
				break;
			case MenuCode.TrailingStopLossEditorFinalSubmit:
				const trailingStopLossRequestAfterFinalSubmit = await this.getTrailingStopLossPositionRequestFromSession(telegramWebhookInfo, env);
				await this.sendTrailingStopLossRequestToTokenPairPositionTracker(trailingStopLossRequestAfterFinalSubmit, telegramWebhookInfo, env);
				menu = new MenuMain(telegramWebhookInfo, userData, userData.hasWallet);
				break;
			case MenuCode.TrailingStopLossEntryBuyQuantityMenu:
				const quantityAndTokenForBuyQuantityMenu : QuantityAndToken = await this.getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramWebhookInfo, env);
				menu = new MenuTrailingStopLossEntryBuyQuantity(telegramWebhookInfo, userData, quantityAndTokenForBuyQuantityMenu);
				break;
			case MenuCode.TrailingStopLossPickVsTokenMenu:
				const trailingStopLossVsTokenNameAndAddress : TokenNameAndAddress = await this.getTrailingStopLossPositionVsTokenFromSession(telegramWebhookInfo, env);
				menu = new MenuTrailingStopLossPickVsToken(telegramWebhookInfo, userData, trailingStopLossVsTokenNameAndAddress);
				break;
			case MenuCode.TrailingStopLossPickVsTokenMenuSubmit:
				const trailingStopLossSelectedVsToken = callbackData.menuArg!!;
				const parsedTrailingStopLossSelectedVsToken = VsToken[trailingStopLossSelectedVsToken as keyof typeof VsToken ]
				const trailingStopLossSelectedVsTokenAddress = getVsTokenAddress(parsedTrailingStopLossSelectedVsToken);
				await this.storeSessionStates(telegramWebhookInfo.messageID, new Map<SessionKey,boolean|number|string|null>([
					[SessionKey.VsToken, trailingStopLossSelectedVsToken],
					[SessionKey.VsTokenAddress, trailingStopLossSelectedVsTokenAddress]
				]), telegramWebhookInfo, env);
				const trailingStopLossPositionRequestAfterSubmittingVsToken = await this.getTrailingStopLossPositionRequestFromSession(telegramWebhookInfo, env);
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
		const deleteMessageRequest = this.makeDeleteMessageRequest(messageID, env);
		return await this.sendRequestToTG(deleteMessageRequest).then(async (deleteMessageResponse) => {
			if (!deleteMessageResponse.ok) {
				return makeFakeFailedRequestResponse(500, "Could not delete menu");
			}
			else {
				return await this.deleteSessionFromUserDO(messageID).then((deleteSessionResponse) => {
					if (!deleteSessionResponse.ok) {
						return makeFakeFailedRequestResponse(500, "Could not delete session for message");
					}
					else {
						return makeSuccessResponse();
					}
				});
			}
		});
	},

	async deleteSessionFromUserDO(messageID : number) : Promise<Response> {
		const deleteSessionRequestBody : DeleteSessionRequest = { messageID: messageID };
		const request = makeUserDOFetchRequest(UserDOFetchMethod.deleteSession, deleteSessionRequestBody);
		return await fetch(request);
	},

	makeDeleteMessageRequest(messageID : number, env : Env) : Request {
		const deleteMessageBody : any = { message_id: messageID };
		const request = makeJSONRequest(makeTelegramBotUrl("deleteMessage", env), deleteMessageBody);
		return request;
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

	async getTrailingStopLossPositionVsTokenFromSession(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<TokenNameAndAddress> {
		const sessionState = await this.getSessionState(telegramWebhookInfo.messageID, [
			SessionKey.VsToken,
			SessionKey.VsTokenAddress
		], telegramWebhookInfo, env);
		return {
			token: sessionState.vsToken as string,
			tokenAddress: sessionState.vsTokenAddress as string
		};
	},

	async getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramWebhookInfo : TelegramWebhookInfo, env: Env) : Promise<QuantityAndToken> {
		const sessionState = await this.getSessionState(telegramWebhookInfo.messageID, [
			SessionKey.VsToken,
			SessionKey.VsTokenAddress,
			SessionKey.VsTokenAmt
		], telegramWebhookInfo, env);
		return {
			thisToken: sessionState.vsToken as string,
			thisTokenAddress: sessionState.vsTokenAddress as string,
			quantity: sessionState.vsTokenAmt as number
		};
	},

	async sendTrailingStopLossRequestToTokenPairPositionTracker(trailingStopLossPositionRequest : LongTrailingStopLossPositionRequest, telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<void> {
		const userDO : DurableObjectStub = this.getUserDO(telegramWebhookInfo, env);
		const request = makeUserDOFetchRequest(UserDOFetchMethod.requestNewPosition, trailingStopLossPositionRequest, 'POST');
		return await userDO.fetch(request).then((response) => {
			if (!response.ok) {
				throw new Error("Failed to send new position request");
			}
		});
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

	async getTrailingStopLossPositionRequestFromSession(telegramWebhookInfo : TelegramWebhookInfo, env: Env) : Promise<LongTrailingStopLossPositionRequest> {
		const positionSessionInfo = await this.getSessionState(telegramWebhookInfo.messageID, [
			SessionKey.PositionID,
			SessionKey.Token,
			SessionKey.TokenAddress,
			SessionKey.VsToken,
			SessionKey.VsTokenAddress,
			SessionKey.VsTokenAmt,
			SessionKey.PositionType,
			SessionKey.TrailingStopLossSlippagePct,
			SessionKey.TrailingStopLossTriggerPercent,
			SessionKey.TrailingStopLossRetrySellIfSlippagePctExceeded,
			SessionKey.TrailingStopLossRetrySellIfPartialFill
		], telegramWebhookInfo, env);
		const positionRequest : LongTrailingStopLossPositionRequest = {
			positionID : positionSessionInfo["positionID"]!! as string, 
			type : PositionType.LongTrailingStopLoss,
			token : positionSessionInfo["token"]!! as string,
			tokenAddress : positionSessionInfo["tokenAddress"]!! as string,
			vsToken : positionSessionInfo["vsToken"]!! as string,
			vsTokenAddress : positionSessionInfo["vsTokenAddress"]!! as string,
			vsTokenAmt : positionSessionInfo["vsTokenAmt"]!! as number,
			slippagePercent : positionSessionInfo["slippagePercent"]!! as number,
			triggerPercent : positionSessionInfo["triggerPercent"]!! as number,
			retrySellIfPartialFill : positionSessionInfo["retrySellIfPartialFill"]!! as boolean,
		}
		return positionRequest;
	},

	TODOstubbedMenu(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env : Env) : BaseMenu {
		return new MenuTODO(telegramWebhookInfo, userData);
	},

	async handleManuallyClosePosition(positionID : string, telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
		if (positionID == null) {
			return makeSuccessResponse();
		}
		const userDO = this.getUserDO(telegramWebhookInfo, env);
		const closePositionsRequestBody : ClosePositionsRequest = { positionIDs : [positionID] };
		const closePositionsRequest = makeUserDOFetchRequest(UserDOFetchMethod.manuallyClosePosition, closePositionsRequestBody);
		return await userDO.fetch(closePositionsRequest);
	},

	async handleCreateWallet(telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Response> {
		const userDO = this.getUserDO(telegramWebhookInfo, env);
		const request = makeUserDOFetchRequest(UserDOFetchMethod.generateWallet);
		return await userDO.fetch(request);
	},

	async handleCommand(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, env: any) : Promise<Response> {
		const command = telegramWebhookInfo.command!!;
		let menu : BaseMenu|null = null;// : Request|null = null;
		switch(command) {
			case '/start':
				menu = new MenuMain(telegramWebhookInfo, userData, userData.hasWallet);
				break;
			case '/help':
				menu = new MenuHelp(telegramWebhookInfo, userData);
				break;
			case '/autosell':
				const positionRequest : LongTrailingStopLossPositionRequest = {
					positionID : crypto.randomUUID(),
					type: PositionType.LongTrailingStopLoss,
					token : 'fakeToken',
					tokenAddress: 'fakeTokenAddress',
					vsToken : 'SOL',
					vsTokenAddress: 'fakeSOLAddress',
					vsTokenAmt : 1.0,
					triggerPercent : 5,
					slippagePercent: 5,
					retrySellIfPartialFill : true
				}
				const sessionValues = this.convertLongTrailingStopLossRequestToSessionValues(positionRequest);
				await this.storeSessionStates(telegramWebhookInfo.messageID, sessionValues, telegramWebhookInfo, env);
				menu = this.makeTrailingStopLossRequestEditorMenu(telegramWebhookInfo, userData, positionRequest);
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


	makeSuccessRequestResponse() {
		return new Response(null, {
			status: 200,
			statusText: "200"
		});
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

	async getPosition(positionID : string, telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Position> {
		const body : GetPositionRequest = { positionID : positionID };
		const request = makeUserDOFetchRequest(UserDOFetchMethod.getPosition, body);
		const userDO = this.getUserDO(telegramWebhookInfo, env);
		const response = await userDO.fetch(request);
		return await response.json() as Position;
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

	async storeSessionState(messageID : number, 
		sessionKey : SessionKey, value : boolean|number|string|null,
		telegramWebhookInfo : TelegramWebhookInfo,
		env : Env) {
		const sessionValues = new Map<SessionKey,boolean|number|string|null>([[sessionKey,value]]);
		return await this.storeSessionStates(messageID, sessionValues, telegramWebhookInfo, env);
	},

	async storeSessionStates(messageID : number, 
		sessionValues : Map<SessionKey,boolean|number|string|null>,
		telegramWebhookInfo : TelegramWebhookInfo,
		env : Env) {
		const sessionValuesRecord : Record<string,boolean|number|string|null> = {};
		for (const [sessionKey,value] of sessionValues) {
			sessionValuesRecord[sessionKey.toString()] = value;
		}
		const userDO = this.getUserDO(telegramWebhookInfo, env) as DurableObjectStub;
		const requestBody : StoreSessionValuesRequest = {
			messageID: messageID,
			sessionValues: sessionValuesRecord
		};
		const request = makeUserDOFetchRequest(UserDOFetchMethod.storeSessionValues, requestBody);
		return await userDO.fetch(request).then((response) => {
			if (!response.ok) {
				throw new Error("Unable to store session state");
			}	
		});
	},

	async getSessionState(messageID : number, sessionKeys : SessionKey[], telegramWebhookInfo : TelegramWebhookInfo, env : Env) : Promise<Record<string,boolean|number|string|null>> {
		const userDO = this.getUserDO(telegramWebhookInfo, env) as DurableObjectStub;
		const requestBody : GetSessionValuesRequest = {
			messageID: messageID,
			sessionKeys: sessionKeys.map(x => { return x.toString()})	
		};
		const sessionValuesRequest = makeUserDOFetchRequest(UserDOFetchMethod.getSessionValues, requestBody);
		return await userDO.fetch(sessionValuesRequest).then(async (response) => {
			if (!response.ok) {
				throw new Error("Could not retrieve session state");
			}
			else {
				const jsonResponse = await response.json() as SessionValuesResponse;
				return jsonResponse.sessionValues;
			}
		});
	}
};