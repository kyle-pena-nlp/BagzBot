import { isAdminOrSuperAdmin, isTheSuperAdminUserID } from "../admins";
import { Env } from "../env";
import { CallbackData } from "../menus/callback_data";
import { TGTextEntity, TGTextEntityType } from "./telegram_helpers";

// Interprets and parses a telegram webhook request.
export class TelegramWebhookInfo {

    private _impersonatedUserID : number; // the userID on whose behalf the action are performed
	private _realUserID : number; // different from above only if impersonating
    private _telegramUserName : string;
    chatID : number; /* The Telegram chat ID */
    messageID : number; /* The message ID, but the original message ID if a callback or response */
    text : string|null; // the text of the message
	
	realMessageID : number|undefined; /* The actual message ID */
    messageType : 'callback'|'message'|'command'|'replyToBot'|null; // determined dynamically from request
    command: string|null;
	commandTokens : TGTextEntity[]|null; // parsed from request
    callbackData : CallbackData|null; // parsed from request
	originalMessageText : string|null; // the original message text if it is a response to a message


    constructor(telegramRequestBody : any, env : Env) {
		this.chatID = this.extractChatID(telegramRequestBody);
		this._impersonatedUserID = this.extractTelegramUserID(telegramRequestBody);
		this._realUserID = this.extractTelegramUserID(telegramRequestBody);		
		this.messageID = this.extractEffectiveMessageID(telegramRequestBody, env);
		this.realMessageID = telegramRequestBody?.message?.message_id;
		this.messageType = this.extractMessageType(telegramRequestBody, env);
		this.command = this.extractCommandText(telegramRequestBody);
		this.commandTokens = this.extractCommandTokens(telegramRequestBody);
		this._telegramUserName = this.extractTelegramUserName(telegramRequestBody);
		this.callbackData = this.extractCallbackData(telegramRequestBody);
		this.text = this.extractMessageText(telegramRequestBody);
		this.originalMessageText = this.extractOriginalMessageText(telegramRequestBody);
	}

	getTelegramUserID(kind : 'impersonated'|'real' = 'impersonated') : number {
		if (kind === 'real') {
			return this._realUserID;
		}
		else {
			// this value is almost always the same as _realUserID
			// the exception would be when an admin is impersonating another user
			return this._impersonatedUserID;
		}
	}

	getTelegramUserName(kind : 'real'|'impersonated' = 'impersonated') : string {
		if (kind === 'real') {
			return this._telegramUserName;
		}
		else if (this._realUserID !== this._impersonatedUserID) {
			return `[IMPERSONATING ${this._impersonatedUserID}]`;
		}
		else {
			return this._telegramUserName;
		}
	}

	isAdminOrSuperAdmin(env : Env) {
		return isAdminOrSuperAdmin(this._realUserID, env);
	}

	isImpersonatingAUser() {
		return this._realUserID !== this._impersonatedUserID;
	}

	impersonate(userToImpersonateID : number, env : Env) : 'now-impersonating-user'|'not-permitted' {
		if (!isAdminOrSuperAdmin(this._realUserID, env)) {
			return 'not-permitted';
		}
		const impersonatingAnAdmin = isAdminOrSuperAdmin(userToImpersonateID, env);
		if (impersonatingAnAdmin && !isTheSuperAdminUserID(this._realUserID, env)) {
			return 'not-permitted';
		}
		this._impersonatedUserID = userToImpersonateID;
		return 'now-impersonating-user';
	}

	unimpersonate(env : Env) {
		this._impersonatedUserID = this._realUserID;
	}

	private extractOriginalMessageID(telegramRequestBody : any) : number|null {
		return telegramRequestBody.message?.reply_to_message?.message_id;
	}

	private extractOriginalMessageText(telegramRequestBody : any) : string|null {
		return telegramRequestBody.message?.reply_to_message?.text;
	}

	private extractIsReplyToBotMessage(telegramRequestBody : any, env : Env) {
		const originalMessageFrom = telegramRequestBody.message?.reply_to_message?.from;
		const botID = (originalMessageFrom?.id||'').toString();
		if (botID === env.TELEGRAM_BOT_ID) {
			return true;
		}
		return false;
	}	

	private extractChatID(requestBody : any) : number {
		let chatID = requestBody?.callback_query?.message?.chat?.id;
		if (chatID == null) {
			chatID = requestBody?.message?.chat?.id;
		}
		return chatID;
	}

	private extractEffectiveMessageID(requestBody : any, env : Env) : number {
		if (this.extractIsReplyToBotMessage(requestBody, env)) {
			return this.extractOriginalMessageID(requestBody)!!;
		}
		let messageID = requestBody?.callback_query?.message?.message_id;
		if (messageID == null) {
			messageID = requestBody?.message?.message_id;
		}
		return messageID;
	}

	private extractMessageType(requestBody : any, env : Env) : 'callback'|'message'|'command'|'replyToBot'|null {
		if ('callback_query' in requestBody) {
			return 'callback';
		}
		else if (this.extractIsReplyToBotMessage(requestBody, env)) {
			return 'replyToBot';
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

	private extractMessageText(telegramRequestBody : any) : string|null {
		return telegramRequestBody.message?.text||null;
	}

	private extractCallbackData(telegramRequestBody : any) : CallbackData|null {
		const callbackDataString = telegramRequestBody?.callback_query?.data;
		if (!callbackDataString) {
			return null;
		}
		else {
			return CallbackData.parse(callbackDataString);
		}
	}

	private hasCommandEntity(requestBody : any) {
		const commandText = this.extractCommandText(requestBody);
		return commandText;
	}
    
	private extractCommandText(requestBody : any) : string|null {
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

	private extractCommandTokens(requestBody : any) : TGTextEntity[]|null {
		const text = (requestBody?.message?.text || '') as string;
		const entities = requestBody?.message?.entities as RawTGTextEntity[]|null;
		if (!entities) {
			return null;
		}
		entities.sort(e => e.offset);
		const tgTextEntities : TGTextEntity[] = [];
		let endOfLastToken = 0;
		for (const entity of entities) {
			if (entity.offset > endOfLastToken) {
				const words = text.substring(endOfLastToken, entity.offset).split(/\s+/).filter(s => s);
				const tokens = words.map(w => { 
					return {
						type: TGTextEntityType.text,
						text: w
					};
				});
				tgTextEntities.push(...tokens);
			}
			const entityType = this.interpretTGEntityType(entity.type);
			const entityText = text.substring(entity.offset, entity.offset + entity.length);
			endOfLastToken = entity.offset + entity.length;
			tgTextEntities.push({
				type: entityType,
				text: entityText
			});
		}
		const trailingText = text.substring(endOfLastToken);
		const trailingTokens = trailingText.split(/\s+/).filter(s => s);
		tgTextEntities.push(...trailingTokens.map(w => { return { type: TGTextEntityType.text, text: w }; }));
		return tgTextEntities;
	}

	private interpretTGEntityType(type : string) : TGTextEntityType {
		switch(type) {
			case 'hashtag':
				return TGTextEntityType.hashtag;
			case 'cashtag':
				return TGTextEntityType.cashtag;
			case 'bot_command':
				return TGTextEntityType.bot_command;
			case 'url':
				return TGTextEntityType.url;
			case 'text_mention':
				return TGTextEntityType.text_mention;
			default:
				return TGTextEntityType.other;
		}
	}

	private extractTelegramUserID(telegramRequestBody : any) : number {
		let userID : number = telegramRequestBody?.message?.from?.id!!;
		if (!userID) {
			userID = telegramRequestBody?.callback_query?.from?.id!!;
		}
		return userID;
	}

	private extractTelegramUserName(requestBody : any) : string {
		const fromParentObj = requestBody?.message || requestBody?.callback_query;
		const firstName : string = fromParentObj.from?.first_name!!;
		const lastName : string = fromParentObj.from?.last_name!!;
		const userName = [firstName, lastName].filter(x => x).join(" ") || 'user';
		return userName;
	}
}

interface RawTGTextEntity {
	type : string
	offset : number
	length : number
}

