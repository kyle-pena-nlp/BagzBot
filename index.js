/**
 * @typedef Bindings
 * @property {DurableObjectNamespace} COUNTER
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
		/*
			The Telegram bot's webhook hits the fetch method for this worker.
		*/
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
			return this.makeFailedRequestResponse(500);
		}
	},

	async _fetch(req, env) {

		// First, validate that this req is coming from the telegram bot's webhook. Early out if not.
		const webhookRequestValidation = this.validateRequest(req,env);
		if (!webhookRequestValidation.ok) {
			this.logWebhookRequestFailure(req,webhookRequestValidation.message);
			return this.makeResponseToSussyWebhookRequest(req,webhookRequestValidation.message);
		}
		// parse JSON from request
		const content = await this.tryParseContent(req,env);
		if (!content.ok) {
			this.logWebhookRequestFailure(req,content.message);
			return this.makeFailedRequestResponse(400);
		}
		// handle button presses
		if (this.isCallbackQuery(content.value)) {
			return await this.handleCallbackQuery(req, env, content.value);
		}
		// handle commands
		else if (this.isRecognizedCommand(content.value)) {
			return await this.handleCallbackQuery(req, env, content.value);
		}
		// handle messages
		else if (this.isMessage(content.value)) {
			return await this.handleMessage(req, env, content.value);
		}
		
		// send a 200 if none of these conditions are met - otherwise telegram will keep trying to resend
		return this.makeSuccessResponse();
	},

	async handleNewPrivateChat(content) {

	},

	isCallbackQuery(content) {
		return "callback_query" in content;
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

	async handleCommand(content) {

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

	async executeVerb(verb, req, env) {
		switch(verb) {
			case 'CREATE_BOT_ADMINISTERED_WALLET':
				return await this.createBotAdministeredWallet(req, env);
			case 'CREATE_TRAILING_STOP_LOSS_ORDER':
				return await this.createTrailingStopLossOrder(req, env);
			case 'CANCEL_TRAILING_STOP_LOSS_ORDER':
				return await this.cancelTrailingStopLossOrder(req, env);
			case 'LIST_OPEN_TRAILING_STOP_LOSS_ORDER_STATUSES':
				return await this.listOpenTrailingStopLossOrderStatuses(req, env);
		}
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

	getTrailingStopLossOpenOrdersDurableObject() {
		let trailingStopLossOpenOrdersDurableObjectID = env.TRAILING_STOP_LOSS_OPEN_ORDERS.idFromName('TRAILING_STOP_LOSS_OPEN_ORDERS');
		let trailingStopLossOpenOrders = env.PAIR_OPEN_ORDERS.get(trailingStopLossOpenOrdersDurableObjectID);
		return trailingStopLossOpenOrders;
	},

	async fetchAndUpdateAllPrices(trailingStopLossOpenOrders) {
		let resp = await trailingStopLossOpenOrders.fetch(UPDATE_PRICES_URL);
		return resp;
	}
};



/**
 * Durable Object
 */
export class TrailingStopLossOpenOrders {
	 /**
	 * @param {DurableObjectState} state
	 */
	constructor(state) {
		this.state = state;
	}

	async fetch(request) {
		let url = new URL(request.url);
		switch (url.pathname) {
			case '/update':
				let latestPrice = 0.0; // pull from request somehow				
				const trailingStopLossSellOrders = await this.updateHighestPrices(latestPrice);
				this.executeTrailingStopLessSellOrders(trailingStopLossSellOrders);
			case '/cancel':
				this.cancelTrailingStopLossOrder()
			case '/destroy':
				break
		}
	}

	async cancelTrailingStopLossOrder(openOrderID) {
		this.state.storage.put(this.getCancellationRequestToken(openOrderID), true);
	}

	getCancellationRequestToken(openOrderID) {
		return `cancellation_request/{openOrderID}`;
	}

	getSellOrderRequestToken(openOrderID) {
		return `sell_request/{openOrderID}`;
	}

	async updateHighestPrices(latestPrice) {
		/*
			Update the highest prices (peak prices) across all open trailing stop loss orders (`currentHighestPrices`)
			Then return which accounts should have their sell orders executed (`trailingStopLossSellOrders`)
		*/

		// Get a map which has current highest price for the account as the key, list of such accounts as value.
		const currentHighestPrices = this.state.storage.get('currentHighestPrices');

		/* 
			Explanation of `currentHighestPrices` map:
			It is a map of unique current highest prices across all open trailing stop loss orders.
			If you have...
			 	6 accounts with current highest price of $3.50
				2 with current highest price of $2.60
			You have a Map with two keys:  3.50 and 2.60,
			whose values are the 6 accounts and 2 accounts, respectively.

			There can be more than one unique highest price because swaps can happen
			at different points in time, thus the current highest for a swap
			opened a few seconds ago may be different from the one opened a few hours ago.

			Storing the accounts in this way makes updating current prices fast without looping through all accounts...
			You just update the keys.
		*/


		// We will build a new highestPrices map.
		const updatedHighestPrices = new Map();

		// For each unique current highest price...
		for (const highestPrice of currentHighestPrices) {

			// Get the list of accounts which have that highest price
			const accountList = currentHighestPrices[highestPrice];
			
			// Determine if that highest price needs to be updated, and to what
			const updatedHighestPrice = (highestPrice < latestPrice) ?  latestPrice : highestPrice;
			
			// And create or push to the list of accounts with that highest price
			// (That way, when two lists of accounts now have the same highest price, the lists get merged!)
			if (!updatedHighestPrices.has(updatedHighestPrice)) {
				updatedHighestPrices[updatedHighestPrice] = accountList;
			}
			else {
				updatedHighestPrices[updatedHighestPrice].push(...accountList);
			}
		}
	
		// update highest prices map in state
		this.state.storage.put('currentHighestPrices', updatedHighestPrices);

		// Now we have a map of updated unique highest prices, with a list of accounts in each.
		// So, let's determine which ones have their trigger conditions met.

		const trailingStopLossSellOrders = []

		// TODO: some kind of prioritization?
		for (const highestPrice of updatedHighestPrices) {
			const currentTrailingPercentage = (highestPrice - latestPrice)/highestPrice;
			const accountList = updatedHighestPrices[highestPrice];
			for (const account of accountList) {
				if (currentTrailingPercentage >= account.trailingLossPercentage) {
					trailingStopLossSellOrders.push(account);
				}
			}
		}

		return trailingStopLossSellOrders;
	}
}

/**
 * Durable Object
 */
export class Counter {
	/**
	 * @param {DurableObjectState} state
	 */
	constructor(state) {
		this.state = state;
		
	}

	/**
	 * Handle HTTP requests from clients.
	 * @param {Request} request
	 */
	async fetch(request) {
		// Apply requested action.
		let url = new URL(request.url);

		// Durable Object storage is automatically cached in-memory, so reading the same key every request is fast.
		// (That said, you could also store the value in a class member if you prefer.)
		/** @type {number} */
		let value = (await this.state.storage.get('value')) || 0;

		switch (url.pathname) {
			case '/increment':
				++value;
				break;
			case '/decrement':
				--value;
				break;
			case '/':
				// Just serve the current value.
				break;
			default:
				return new Response('Not found', { status: 404 });
		}

		// We don't have to worry about a concurrent request having modified the
		// value in storage because "input gates" will automatically protect against
		// unwanted concurrency. So, read-modify-write is safe. For more details,
		// see: https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/
		await this.state.storage.put('value', value);

		return new Response('' + value);
	}
}
