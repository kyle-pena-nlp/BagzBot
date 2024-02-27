import { CallbackData } from "./callback_data";

export class TelegramWebhookInfo {

    telegramUserID : number
    telegramUserName : string
    chatID : number /* The Telegram chat ID */
    messageID : number /* The telegram message ID */
    messageType : 'callback'|'message'|'command'|null
    command: string|null
    callbackData : CallbackData|null
    text : string|null

    constructor(telegramRequestBody : any) {
		this.chatID = this.getChatID(telegramRequestBody);
		this.messageID = this.getMessageID(telegramRequestBody);
		this.messageType = this.getMessageType(telegramRequestBody);
		this.command = this.getCommandText(telegramRequestBody);
		this.telegramUserID = this.getTelegramUserID(telegramRequestBody);
		this.telegramUserName = this.getTelegramUserName(telegramRequestBody);
		this.callbackData = this.getCallbackData(telegramRequestBody);
		this.text = this.getMessageText(telegramRequestBody);
	}

	getChatID(requestBody : any) : number {
		let chatID = requestBody?.callback_query?.message?.chat?.id;
		if (chatID == null) {
			chatID = requestBody?.message?.chat?.id;
		}
		return chatID;
	}

	getMessageID(requestBody : any) : number {
		let messageID = requestBody?.callback_query?.message?.message_id;
		if (messageID == null) {
			messageID = requestBody?.message?.message_id;
		}
		return messageID;
	}

	getMessageType(requestBody : any) : 'callback'|'message'|'command'|null {
		if ('callback_query' in requestBody) {
			return 'callback';
		}
		else if (this.hasCommandEntity(requestBody)) {
			return 'command';
		}		
		else if ('message' in requestBody) {
			return 'message';
		}
		else {
			return null;
		}
	}

	getMessageText(telegramRequestBody : any) : string|null {
		return telegramRequestBody.message?.text||null;
	}

	getCallbackData(telegramRequestBody : any) : CallbackData|null {
		const callbackDataString = telegramRequestBody?.callback_query?.data;
		if (!callbackDataString) {
			return null;
		}
		else {
			return CallbackData.parse(callbackDataString)
		}
	}

	hasCommandEntity(requestBody : any) {
		const commandText = this.getCommandText(requestBody);
		return commandText;
	}

    
	getCommandText(requestBody : any) : string|null {
		const text = requestBody?.message?.text || '';
		const entities = requestBody?.message?.entities;
		if (!entities) {
			return null;
		}
		for (const entity of entities) {
			if (entity.type === 'bot_command') {
				const commandText = text.substring(entity.offset, entity.offset + entity.length);
				return commandText;
			}
		}
		return null;
	}

	getTelegramUserID(telegramRequestBody : any) : number {
		let userID : number = telegramRequestBody?.message?.from?.id!!;
		if (!userID) {
			userID = telegramRequestBody?.callback_query?.from?.id!!;
		}
		return userID;
	}

	getTelegramUserName(requestBody : any) : string {
		const fromParentObj = requestBody?.message || requestBody?.callback_query
		const firstName : string = fromParentObj.from?.first_name!!;
		const lastName : string = fromParentObj.from?.last_name!!;
		const userName = [firstName, lastName].filter(x => x).join(" ") || 'user';
		return userName;
	}
}