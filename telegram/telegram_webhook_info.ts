import { isAnAdminUserID, isTheSuperAdminUserID } from "../admins";
import { Env } from "../env";
import { CallbackData } from "../menus/callback_data";
import { PositionPreRequest, PositionType } from "../positions";
import { getVsTokenInfo } from "../tokens";
import { assertNever } from "../util";
import { CallbackHandlerData } from "../worker/model/callback_handler_data";
import { TGTextEntity, TGTextEntityType } from "./telegram_helpers";

export class AutoSellOrderSpec {

	userID : number;
	chatID : number;
	messageID : number;
	tokenAddress : string;
	vsTokenAddress : string;
	vsTokenAmt : number;
	triggerPct : number;
	slippageTolerancePct : number;
	autoRetrySellIfSlippageExceeded? : boolean;
	
	constructor(
		userID : number,
		chatID : number,
		messageID : number,
		tokenAddress : string, 
		vsTokenAddress : string, 
		vsTokenAmt : number, 
		triggerPct : number, 
		slippageTolerancePct : number, 
		autoRetrySellIfSlippageExceeded? : boolean) {
		this.userID = userID;
		this.chatID = chatID;
		this.messageID = messageID;
		this.tokenAddress = tokenAddress;
		this.vsTokenAddress = vsTokenAddress;
		this.vsTokenAmt = vsTokenAmt;
		this.triggerPct = triggerPct;
		this.slippageTolerancePct = slippageTolerancePct;
		this.autoRetrySellIfSlippageExceeded = autoRetrySellIfSlippageExceeded;
	}

	toPositionPreRequest() : PositionPreRequest {
		const positionRequest : PositionPreRequest = {
			userID : this.userID,
			chatID : this.chatID,
			messageID : this.messageID,
			positionID : crypto.randomUUID(),
			positionType : PositionType.LongTrailingStopLoss,
			tokenAddress : this.tokenAddress,
			vsToken : getVsTokenInfo(this.vsTokenAddress),
			vsTokenAmt : this.vsTokenAmt,
			slippagePercent : this.slippageTolerancePct,
			triggerPercent : this.triggerPct,
			retrySellIfSlippageExceeded : this.autoRetrySellIfSlippageExceeded || true
		};
		return positionRequest;
	}

	static describeFormat() : string {
		return '/autosell 1.5 SOL of [tokenAddress] trigger 5% slippage 0.5% retrysell yes';
	}


	private static maybeParseVsTokenAddress(entity : TGTextEntity) : string|null {
		if (entity.type != TGTextEntityType.text) {
			return null;
		}
		const text = entity.text;
		try {
			const vsTokenAddress = getVsTokenInfo(text).address;
			return vsTokenAddress;
		}
		catch {
			return null;
		}
	}

	private static maybeParseBoolean(entity : TGTextEntity) : boolean|null {
		if (entity.type != TGTextEntityType.text) {
			return null;
		}
		const text = entity.text.toLowerCase();
		if (text === 'yes' || text === 'true' || text === 'y') {
			return true;
		}
		else if (text === 'no' || text === 'false' || text === 'n') {
			return false;
		}
		else {
			return null;
		}
	}

	private static maybeParsePercent(entity : TGTextEntity) : number|null {
		if (entity.type != TGTextEntityType.text) {
			return null;
		}
		let text = entity.text;
		if (text.endsWith("%")) {
			text = text.substring(0, text.length-1);
		}
		try {
			const value = parseFloat(text);
			return value;
		}
		catch {
			return null;
		}
	}

	private static maybeParseKeyword(entity : TGTextEntity, keyword : string) : string|null {
		if (entity.type != TGTextEntityType.text) {
			return null;
		}
		let text = entity.text.toLowerCase();
		if (keyword === text) {
			return keyword;
		}
		else {
			return null;
		}
	}	

	private static maybeParseFloat(entity : TGTextEntity) : number|null {
		if (entity.type != TGTextEntityType.text) {
			return null;
		}
		try {
			const value = parseFloat(entity.text);
			return value;
		}
		catch {
			return null;
		}
	}	
}

export class TelegramWebhookInfo {

    private _impersonatedUserID : number; // the userID on whose behalf the action are performed
	private _realUserID : number; // different from above only if impersonating
    telegramUserName : string;
    chatID : number; /* The Telegram chat ID */
    messageID : number; /* The telegram message ID (see comments) */
	realMessageID : number|undefined;
    messageType : 'callback'|'message'|'command'|'replyToBot'|null;
    command: string|null;
	commandTokens : TGTextEntity[]|null;
    callbackData : CallbackData|null;
	originalMessageText : string|null;
    text : string|null;

    constructor(telegramRequestBody : any, env : Env) {
		this.chatID = this.extractChatID(telegramRequestBody);
		this._impersonatedUserID = this.extractTelegramUserID(telegramRequestBody);
		this._realUserID = this.extractTelegramUserID(telegramRequestBody);		
		this.messageID = this.extractEffectiveMessageID(telegramRequestBody, env);
		this.realMessageID = telegramRequestBody?.message?.message_id;
		this.messageType = this.extractMessageType(telegramRequestBody, env);
		this.command = this.extractCommandText(telegramRequestBody);
		this.commandTokens = this.extractCommandTokens(telegramRequestBody);
		this.telegramUserName = this.extractTelegramUserName(telegramRequestBody);
		this.callbackData = this.extractCallbackData(telegramRequestBody);
		this.text = this.extractMessageText(telegramRequestBody);
		this.originalMessageText = this.extractOriginalMessageText(telegramRequestBody);
	}

	getTelegramUserID(purpose : 'messaging'|'app-logic') : number {
		if (purpose === 'messaging') {
			return this._realUserID;
		}
		else if (purpose === 'app-logic') {
			return this._impersonatedUserID;
		}
		else {
			assertNever(purpose);
		}
	}

	impersonate(userToImpersonateID : number, env : Env) : 'now-impersonating-user'|'not-permitted' {
		if (!isAnAdminUserID(this._realUserID, env)) {
			return 'not-permitted';
		}
		const impersonatingAnAdmin = isAnAdminUserID(userToImpersonateID, env);
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

	toCallbackHandlerData() : CallbackHandlerData {
		const result : CallbackHandlerData = {
			telegramUserID: this._impersonatedUserID,
			telegramUserName: this.telegramUserName,
			chatID : this.chatID,
			messageID: this.messageID,
			callbackData: this.callbackData!!
		};
		return result;
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

