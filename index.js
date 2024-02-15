
/* Durable Objects */
import { UserDO } from "./user_DO";
import { PositionTrackerDO } from "./position_tracker_DO";
import { PolledTokenListDO } from "./polled_token_list_DO";

/* Utility Stuff */
import { Result, ERRORS, ERROR_NOS } from "./common";
import { FAQ_STRING } from "./faq";
import { HELP_STRING } from "./help";

/* Export of imported DO's (required by wrangler) */
export { UserDO, PositionTrackerDO, PolledTokenListDO }


/**
 * Worker
 */
export default {
	/**
	 * @param {Request} req
	 * @param {Bindings} env
	 * @returns {Promise<Response>}
	 */
	async fetch(req, env) {
		// Wrap fetch with custom error handling that always returns 200 (any non-200 code results in endless retries by telegram)
		try {
			const response = await this._fetch(req, env);
			if (!response) {
				this.logWebhookRequestFailure(req, ERRORS.NO_RESPONSE);
				return this.makeFailedRequestResponse(500);
			}
			return response;
		}
		catch(e) {
			this.logWebhookRequestFailure(req, ERRORS.UNHANDLED_EXCEPTION, { "e": e.toString() });
			return this.makeFailedRequestResponse(500); // 500 is stored in statusText, status is still 200
		}
	},

	async _fetch(req, env) {

		// First, validate that this req is coming from the telegram bot's webhook by checking secret key.
		const webhookRequestValidation = this.validateRequest(req,env);
		if (!webhookRequestValidation.ok) {
			// early out
			this.logWebhookRequestFailure(req,webhookRequestValidation.message);
			return this.makeResponseToSussyWebhookRequest(req,webhookRequestValidation.message);
		}

		// Parse JSON from request
		const content = await this.tryParseContent(req,env);
		if (!content.ok) {
			// Early out if json parse fails
			this.logWebhookRequestFailure(req,content.message);
			return this.makeFailedRequestResponse(400);
		}

		const user = this.getUserInfo(req, env);

		const requestInfo = {
			req: req,
			env: env,
			user: user,
			content: content?.value
		};

		// If the user issues a command...
		if (this.isRecognizedCommand(content.value)) {
			// Handle the command
			return await this.handleCommand(requestInfo);
		}		

		// If the user clicks a menu button...
		if (this.isCallbackQuery(content.value)) {
			// Handle the menu button
			return await this.handleCallbackQuery(requestInfo);
		}
		


		// If the user sends a message
		if (this.isMessage(content.value)) {
			// Handle the message
			return await this.handleMessage(requestInfo);
		}
		
		// send a 200 if none of these conditions are met - otherwise telegram will keep trying to resend
		return this.makeSuccessRequestResponse();
	},

	getUserInfo(req, env) {
		const userDO = this.getUserDO(req, env, content.value);
		const user = userDO.fetch("/get");
		return user;
	},

	getUserDO(req, env, content) {
		const userID = this.getUserID(content);
		const userDurableObjectID = env.UserDO.idFromName(userID);
		const userDurableObject = env.UserDO.get(userDurableObjectID);
		return userDurableObject;
	},

	async handleNewPrivateChat(content) {
		return this.makeSuccessRequestResponse();
	},

	isMessage(content) {
		return false;
	},

	isCallbackQuery(content) {
		return "callback_query" in content;
	},

	async handleMessage(req, env, content) {
		return this.makeSuccessRequestResponse();
	},

	async handleCallbackQuery(requestInfo) {

		const content = requestInfo.content;
		const callbackData = content?.callback_query?.data;
		const [menuCode,menuArg] = callbackData.split(":");
		const user    = requestInfo.user;		
		const menu = await this.getMenu(menuCode, menuArg, user);
		
		const chatID = content?.callback_query?.message?.chat?.id;
		const messageID = content?.callback_query?.message?.message_id; 
		const success = await this.sendMenuToTelegram(menu, chatID, messageID);
		if (success) {
			return this.makeSuccessRequestResponse();
		}
		else {
			return this.makeFailedRequestResponse(500);
		}
	},

	async sendMenuToTelegram(menu, chatID, messageID) {
		// == null is true when either null or undefined, but not zero
		const method = (messageID == null) ? 'sendMessage' : 'editMessageText';
		const body = { 
			chat_id: chatID,
			text: menu.text,
			parse_mode: menu.parse_mode,
			reply_markup: {
				"inline_keyboard": menu.options,
				"resize_keyboard": true
			}
		};
		if (method === 'editMessageText') {
			body.message_id = messageID;
		}
		const init = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},			
			body: JSON.stringify(body),
		};
		const url = this.makeTelegramBotUrl(method, env);
		const response = await fetch(url, init);
		if (!response.ok) {
			const responseText = await response.text();
			console.error(responseText + "; " + response.status.toString(10) + "; " + response.statusText);
			return false;
		}
		return true;		
	},

	async getMenu(callbackData, userID) {
		const [menuCode, menuArg] = callbackData.split(":");
		const userData = await this.getUserData(userID);
		switch(menuCode) {
			case 'main':
				return await this.makeMainMenu(userData, menuArg);
			case 'create_wallet':
				return await this.makeCreateWalletMenu(userData, menuArg);				
			case 'list_positions':
				return await this.makeListPositionsMenu(userData, menuArg);					
			case 'open_position':
				return await this.makeOpenPositionMenu(userData, menuArg);
			case 'position_details':
				return await this.makePositionDetailsMenu(userData, menuArg);
			case 'history':
				return await this.makeHistoryMenu(userData, menuArg);
			case 'wallet':
				return await this.makeWalletMenu(userData, menuArg);
			case 'help':
				return await this.makeHelpMenu(userData, menuArg);
			case 'FAQ':
				return await this.makeFAQMenu(userData, menuArg);		
			case 'invite':
				return await this.makeInviteMenu(userData, menuArg);		
			case 'action':
				return await this.performAction(userData, menuArg);			
			default:
				return await this.makeErrorMenu(userData, menuArg);
		}
	},

	async performAction(userData, menuArg) {
		switch(menuArg) {
			case 'create_wallet':
				break;
		}
	},

	async makeMainMenu(userData, menuArg) {

		if (!userData.has_connected_wallet) {
			return this.withText("Main Menu", [
				[ { text: "Create Bagz Bot Wallet", data: "create_wallet" } ],
				this.makeMenuLastLine()
			]);
		}

		return this.withText("Main Menu", [
			[ 
				{ text: "Bagz Bot Wallet", data: "wallet" } 
			],
			[
				{ text: "Open A Position", data: "open_position" }
			],
			[ 
				{ text: "Current Positions", data: "list_positions" },
				{ text: "History", data: "history" },
				{ text: "Balance", data: "balance" }, 
			],
			this.makeMenuLastLine(userData, menuArg)
		]);
	},

	async makeCreateWalletMenu(userData, menuArg) {
		return this.withText("Create A **Bagz Bot Wallet**",
		[
			{ text: "Create", data: "action:create_wallet" },
			this.makeReturnToMainButtonLine()
		])
	},

	async makeHelpMenu(userData, menuArg) {
		const helpMessage = HELP_STRING;
		return this.withText(helpMessage, [this.makeReturnToMainButtonLine(userData, menuArg)]);
	},	

	async makeFAQMenu(userData, menuArg) {
		return this.withText(FAQ_STRING, [this.makeReturnToMainButtonLine(userData, menuArg)]); 
	},

	async makeListPositionsMenu(userData, menuArg) {
		return this.withText("Current Positions", [this.makeReturnToMainButtonLine()])
	},


	withText(text, options, parseMode) {
		return {
			text: text,
			options: options,
			parseMode: parseMode || "MarkdownV2"
		};
	},

	makeMenuLastLine(userData, menuArg) {
		return [ 
			/*{ text: "Options", data: "options" },*/ // can't think of any useful options right now
			{ text: "Help",    data: "help"    },
			{ text: "FAQ",     data: "FAQ"     },
			{ text: "Invite Friends", data: "invite" }
		];
	},

	makeReturnToMainButtonLine(userData, menuArg) {
		return [
			{ text: "Main Menu", data: "main" }
		];
	},

	isRecognizedCommand(content) {
		const commandText = this.getCommandText(content);
		return ["/start", "/help", "/menu"].includes(commandText)
	},

	getCommandText(requestInfo) {
		const content = requestInfo.content;
		const text = content?.message?.text || '';
		const entities = content?.message?.entities;
		if (!entities) {
			return false;
		}
		for (const entity of entities) {
			if (entity.type === 'bot_command') {
				const commandText = text.substring(entity.offset, entity.offset + entity.length);
				return commandText;
			}
		}
		return null;
	},

	getUserID(content) {
		let userID = content?.message?.from?.id;
		if (!userID) {
			userID = content?.callback_query?.from?.id;
		}
		return userID;
	},

	async handleCommand(requestInfo) {
		const command = this.getCommandText(requestInfo);
		switch(command) {
			case '/start':
				await this.displayMainMenu();
			case '/help':
				await this.displayHelpMenu(requestInfo);
			case '/menu':
				await this.displayMainMenu();
			default:
				throw new Error(`Unrecognized command: ${command}`);
		}
		return this.makeSuccessRequestResponse();
	},

	makeTelegramBotUrl(methodName, env) {
		return `${env.TELEGRAM_BOT_SERVER_URL}/bot${env.TELEGRAM_BOT_TOKEN}/${methodName}`;
	},


	async getUserData() {

	},


	makeSuccessRequestResponse() {
		return new Response(null, {
			status: 200,
			statusText: "200"
		});
	},

	makeFailedRequestResponse(status) {
		const response = new Response(null, {
			status: 200, // see comment on retries
			statusText: status.toString()
		});
		return response;
	},

	async tryParseContent(req,env) {
		try {
			const content = await req.json();
			return Result.success(content);
		}
		catch(e) {
			return Result.failure("Exception while parsing request JSON");
		}
	},

	validateRequest(req,env) {
		const requestSecretToken = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
		const secretTokensMatch = (requestSecretToken === env.TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN);
		
		if (!secretTokensMatch) {
			return Result.failure(ERRORS.MISMATCHED_SECRET_TOKEN);
		}
		
		return Result.success(true);
	},

	logWebhookRequestFailure(req, error_code, addl_info_obj) {
		const ip_address = this.ip_address_of(req);
		const addl_info = JSON.stringify(addl_info_obj || {}, null, 0);
		const error_no = ERROR_NOS[error_code]
		console.log(`${ip_address} :: ${error_no} :: ${error_code} :: ${addl_info}`);
	},

	makeResponseToSussyWebhookRequest(req, sus_reason, sussy_info) {
		// 403, forbidden
		const response = new Response(null, {
			status: 403
		});
		return response;
	},


	ip_address_of(req) {
		const ip = req.headers.get('cf-connecting-ip');
		const forwarded_ip = req.headers.get('x-forwarded-for');
		return `${ip}->${forwarded_ip}`;
	},

	logFailedParseChatInfoFromWebhookRequest(req, parseChatInfoFailureReason) {
		const ip_address = this.ip_address_of(req);
		console.log(`${ip_address} :: ${parseChatInfoFailureReason}`);
	},

	makeResponseToChatInfoParseFailure() {
		// 400, bad request
		const response = new Response(null, {
			status: 200, // Annoyingly, bot server will retry requests indefinetely if it gets response out of range of 200-299
			statusText: "400"
		});
		return response;
	},

};