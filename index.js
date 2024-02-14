
import { UserDO } from "./user_DO";
/*import { PositionTrackerDO } from "./position_tracker_DO";
import { PolledTokenListDO } from "./polled_token_list_DO";
*/
const ERRORS = Object.freeze({
	UNHANDLED_EXCEPTION:     "UNHANDLED_EXCEPTION",
	MISMATCHED_SECRET_TOKEN: "MISMATCHED_SECRET_TOKEN",
	NO_RESPONSE: "NO_RESPONSE",
	NOT_A_PRIVATE_CHAT: "NOT_A_PRIVATE_CHAT"
});

const ERROR_NOS = Object.freeze({
	UNHANDLED_EXCEPTION: 500,
	MISMATCHED_SECRET_TOKEN: 1000,
	NO_RESPONSE: 2000,
	NOT_A_PRIVATE_CHAT : 3000
});

class Result {
	constructor(success,message,value) {
		this.success = success;
		this.ok = success;
		this.message = message;
		this.value = value;
	}	

	static success(value) {
		return new Result(true,null,value);
	}

	static failure(message) {
		return new Result(false,message,null);
	}
}

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

		const userDO = this.getUserDO(req, env);

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

		// If the user clicks a menu button...
		if (this.isCallbackQuery(content.value)) {
			// Handle the menu button
			return await this.handleCallbackQuery(req, env, content.value);
		}
		
		// If the user issues a command...
		if (this.isRecognizedCommand(content.value)) {
			// Handle the command
			return await this.handleCommand(req, env, content.value);
		}

		// If the user sends a message
		if (this.isMessage(content.value)) {
			// Handle the message
			return await this.handleMessage(req, env, content.value);
		}
		
		// send a 200 if none of these conditions are met - otherwise telegram will keep trying to resend
		return this.makeSuccessResponse();
	},

	getUserDO(req, env) {
		return null;
	},

	async handleNewPrivateChat(content) {
		return this.makeSuccessResponse();
	},

	isMessage(content) {
		return false;
	},

	isCallbackQuery(content) {
		return "callback_query" in content;
	},

	async handleMessage(req, env, content) {
		return this.makeSuccessResponse();
	},

	async handleCallbackQuery(req, env, content) {

		/* Don't respond if somehow a callback was created in a non-private message */
		const isPrivateChat = content?.callback_query?.message?.chat?.type === "private";
		if (!isPrivateChat) {
			this.logWebhookRequestFailure(req, ERRORS.NOT_A_PRIVATE_CHAT);
			return this.makeFailedRequestResponse(400);
		}

		/* Get data from the callback */
		const callbackData = content?.callback_query?.data;
		const chatID = content?.callback_query?.message?.chat?.id;
		const messageID = content?.callback_query?.message?.message_id; 
		const userID = content?.callback_query?.from?.id;

		/* Synthesize menu */
		const menu = await this.getMenu(callbackData, userID);

		/* Prepare request to update menu */
		const body = { 
			chat_id: chatID,
			message_id: messageID,
			text: menu.text,
			parse_mode: menu.parse_mode,
			reply_markup: {
				"inline_keyboard": menu.options,
				"resize_keyboard": true
			}
		};
		const init = {
			method: "POST",
			headers: {
			  "Content-Type": "application/json",
			},			
			body: JSON.stringify(body),
		};

		/* Make request and validate response */
		const url = this.makeTelegramBotUrl("editMessageText", env);
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
		const helpMessage = `# Bagz Bot How-To Guide
## Create A Bagz Bot Wallet
## Send Funds To Your Bagz Bot Wallet 
## Open A Position
## Close A Position Early
## Withdrawal Funds
## Take Private Ownership of Wallet
## Invite Friends
`;
		return this.withText(helpMessage, [this.makeReturnToMainButtonLine(userData, menuArg)]);
	},	

	async makeFAQMenu(userData, menuArg) {
		const faqMessage = `# What is Bagz Bot?
**Bagz Bot** lets you perform automated crypto trades through a Telegram bot.

# How Does It Work?

The **Bagz Bot** creates a **Bagz Bot Wallet** for you.  After you fund the wallet with USDC, you can 
place automated trades of your choosing and **Bagz Bot** will do the rest.  
You can withdrawal funds or manually close your positions any time you like.
You can also request the **Bagz Bot Wallet** private keys at any time to transfer the wallet to private ownership.

# Does Bagz Bot Cost Anything To Use?
The **Bagz Bot** keeps 0.5% of any return on a position, or $1.00, whichever is greater.
You can also include Priority Fees which may help your trade be executed before other trades.
Priority Fees are completely optional, and are passed onto the DEX rather than kept by the bot.

# What Kind of Positions Can I Open?

## Protecc Ur Long Bagz
The **Protecc Ur Long Bagz** position automatically closes your position when the current price in USDC 
drops below "X percent" off the highest price since you opened the position.  You chose the "X".
For example, if you choose "10 percent",
	and the token is priced at **$0.50** when you open the position, 
	rises to a peak of **$1.00**, 
	and then drops to **$0.90**,
	then this loss of 10% would trigger the **Bagz Bot** to close the position.
You can set slippage tolerance levels when you open the trade.  
If the position is not completely closed due to slippage, the bot will continue to attempt
to sell the position off at the same level of slippage as long as the X% criteria is still in play.

# Where Can I Find Support?

Check out our official Discord Community.

# Legal

See here for Legal.
`;
		return this.withText(faqMessage, [this.makeReturnToMainButtonLine(userData, menuArg)]); 
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
		const text = content?.text;
		return ((text === "/start") || (text === "/help") || (text == "/menu"));
	},

	async handleCommand(req, env, content) {
		const command = content?.text;
		switch(command) {
			case '/start':
				break;
			case '/help':
				break;
			case '/menu':
				break;
			default:
				throw new Error(`Unrecognized command: ${command}`);
		}
		return this.makeSuccessResponse();
	},

	makeTelegramBotUrl(methodName, env) {
		return `${env.TELEGRAM_BOT_SERVER_URL}/bot${env.TELEGRAM_BOT_TOKEN}/${methodName}`;
	},


	async getUserData() {

	},


	makeSuccessResponse() {
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

	// TODO
	async createBotAdministeredWallet(req, env) {
		return;
	},

	// TODO
	async createTrailingStopLossOrder(req, env) {
		return;
	},

	// TODO
	async cancelTrailingStopLossOrder(req, env) {
		return;
	},

	// TODO
	async listOpenTrailingStopLossOrderStatuses(req, env) {
		return;
	},

	async scheduled(event, env, ctx) {
		ctx.waitUntil(doSomeTaskOnASchedule());
	},

};