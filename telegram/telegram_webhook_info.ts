import { CallbackData } from "../menus/callback_data";
import { PositionPreRequest, PositionType } from "../positions/positions";
import { getVsTokenAddress } from "../tokens/vs_tokens";
import { TGTextEntity, TGTextEntityType } from "./telegram_helpers";

export class AutoSellOrderSpec {

	userID : number
	chatID : number
	messageID : number
	tokenAddress : string
	vsTokenAddress : string
	vsTokenAmt : number
	triggerPct : number
	slippageTolerancePct : number
	autoRetrySellIfSlippageExceeded? : boolean
	
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
			vsTokenAddress : this.vsTokenAddress,
			vsTokenAmt : this.vsTokenAmt,
			slippagePercent : this.slippageTolerancePct,
			triggerPercent : this.triggerPct,
			retrySellIfSlippageExceeded : this.autoRetrySellIfSlippageExceeded || true
		};
		return positionRequest;
	}

	static parse(msg : TelegramWebhookInfo) : AutoSellOrderSpec|null {

		const tokens = msg.commandTokens!!;

		const vsTokenAmt : number|null = AutoSellOrderSpec.maybeParseFloat(tokens[1]);
		if (vsTokenAmt == null) {
			return null;
		}
		
		const vsTokenAddress : string|null = AutoSellOrderSpec.maybeParseVsTokenAddress(tokens[2]||null);
		if (vsTokenAddress == null) {
			return null;
		}
		
		const ofKeyword = AutoSellOrderSpec.maybeParseKeyword(tokens[4], "OF");
		if (ofKeyword == null) {
			return null;
		}
		
		const tokenAddress : string|null = tokens[3]?.text||null;
		if (tokenAddress == null) {
			return null;
		}
		
		const percentKeyword = AutoSellOrderSpec.maybeParseKeyword(tokens[4], 'TRIGGER');
		if (percentKeyword == null) {
			return null;
		}

		const triggerPercent = AutoSellOrderSpec.maybeParsePercent(tokens[5]);
		if (triggerPercent == null) {
			return null;
		}

		const slippageKeyword = AutoSellOrderSpec.maybeParseKeyword(tokens[6], 'SLIPPAGE');
		if (slippageKeyword == null) {
			return null;
		}

		const slippageTolerancePercent = AutoSellOrderSpec.maybeParsePercent(tokens[7]);
		if (slippageTolerancePercent == null) {
			return null;
		}

		// these can be left out, but if they are included, they should have the right keyword.
		const autoRetryKeyword = AutoSellOrderSpec.maybeParseKeyword(tokens[8], 'RETRYSELL');
		const autoRetry = AutoSellOrderSpec.maybeParseBoolean(tokens[9])||undefined;
		if (autoRetry != null && autoRetryKeyword == null) {
			return null;
		}
		
		return new AutoSellOrderSpec(msg.telegramUserID, msg.chatID, msg.messageID, tokenAddress, vsTokenAddress, vsTokenAmt, triggerPercent, slippageTolerancePercent, autoRetry);
	}

	static describeFormat() : string {
		return '/autosell 1.5 SOL of [tokenAddress] trigger 5% slippage 0.5% retrysell yes'
	}


	private static maybeParseVsTokenAddress(entity : TGTextEntity) : string|null {
		if (entity.type != TGTextEntityType.text) {
			return null;
		}
		const text = entity.text;
		const vsTokenAddress = getVsTokenAddress(text);
		if (vsTokenAddress == null) {
			return null;
		}
		else {
			return vsTokenAddress;
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

    telegramUserID : number
    telegramUserName : string
    chatID : number /* The Telegram chat ID */
    messageID : number /* The telegram message ID */
    messageType : 'callback'|'message'|'command'|null
    command: string|null
	commandTokens : TGTextEntity[]|null
    callbackData : CallbackData|null
    text : string|null

    constructor(telegramRequestBody : any) {
		this.chatID = this.getChatID(telegramRequestBody);
		this.messageID = this.getMessageID(telegramRequestBody);
		this.messageType = this.getMessageType(telegramRequestBody);
		this.command = this.getCommandText(telegramRequestBody);
		this.commandTokens = this.getCommandTokens(telegramRequestBody);
		this.telegramUserID = this.getTelegramUserID(telegramRequestBody);
		this.telegramUserName = this.getTelegramUserName(telegramRequestBody);
		this.callbackData = this.getCallbackData(telegramRequestBody);
		this.text = this.getMessageText(telegramRequestBody);
	}

	parseAutoSellOrder() : AutoSellOrderSpec|null {
		if (!this.commandTokens) {
			return null;
		}
		const parsedResult = AutoSellOrderSpec.parse(this);
		return parsedResult;
	}

	private getChatID(requestBody : any) : number {
		let chatID = requestBody?.callback_query?.message?.chat?.id;
		if (chatID == null) {
			chatID = requestBody?.message?.chat?.id;
		}
		return chatID;
	}

	private getMessageID(requestBody : any) : number {
		let messageID = requestBody?.callback_query?.message?.message_id;
		if (messageID == null) {
			messageID = requestBody?.message?.message_id;
		}
		return messageID;
	}

	private getMessageType(requestBody : any) : 'callback'|'message'|'command'|null {
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

	private getMessageText(telegramRequestBody : any) : string|null {
		return telegramRequestBody.message?.text||null;
	}

	private getCallbackData(telegramRequestBody : any) : CallbackData|null {
		const callbackDataString = telegramRequestBody?.callback_query?.data;
		if (!callbackDataString) {
			return null;
		}
		else {
			return CallbackData.parse(callbackDataString)
		}
	}

	private hasCommandEntity(requestBody : any) {
		const commandText = this.getCommandText(requestBody);
		return commandText;
	}
    
	private getCommandText(requestBody : any) : string|null {
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

	private getCommandTokens(requestBody : any) : TGTextEntity[]|null {
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
				}});
				tgTextEntities.push(...tokens);
			}
			const entityType = this.getTGEntityType(entity.type);
			const entityText = text.substring(entity.offset, entity.offset + entity.length);
			tgTextEntities.push({
				type: entityType,
				text: entityText
			})
		}
		return tgTextEntities;
	}

	private getTGEntityType(type : string) : TGTextEntityType {
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

	private getTelegramUserID(telegramRequestBody : any) : number {
		let userID : number = telegramRequestBody?.message?.from?.id!!;
		if (!userID) {
			userID = telegramRequestBody?.callback_query?.from?.id!!;
		}
		return userID;
	}

	private getTelegramUserName(requestBody : any) : string {
		const fromParentObj = requestBody?.message || requestBody?.callback_query
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