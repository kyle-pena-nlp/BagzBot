import { 
    MenuSpec, 
    TelegramWebhookInfo, 
    Env, 
    UserData, 
    CallbackButton, 
    MenuCode,
    CallbackData, 
    MenuDisplayMode} from "./common";

export interface MenuCapabilities {
    renderText() : string;
    renderOptions() : CallbackButton[][];
    parseMode() : 'MarkdownV2'|'HTML'
    forceResponse() : boolean
}

export abstract class Menu<T> {

    telegramWebhookInfo : TelegramWebhookInfo
    userData   : UserData
    miscData   : T|undefined

    constructor(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, miscData? : T) {
        this.telegramWebhookInfo = telegramWebhookInfo;
        this.userData = userData;
        this.miscData = miscData;
    }

    protected insertButton(options : CallbackButton[][], text : string, callbackData : CallbackData, lineNumber : number) {
        const button : CallbackButton = { text: text, data : callbackData.toString() };
        while (options.length < lineNumber) {
            options.push([]);
        }
        options[lineNumber].push(button);
    }

    protected insertButtonNextLine(options : CallbackButton[][], text : string, callbackData : CallbackData) {
        const lineNumber = options.length + 1;
        this.insertButton(options, text, callbackData, lineNumber);
    }

    protected insertReturnToMainButtonOnNewLine(options : CallbackButton[][]) {
        const lineNumber = options.length + 1;
        const callbackData = new CallbackData(MenuCode.Main, undefined);
        this.insertButton(options, 'Main Menu', callbackData, lineNumber);
    }

    protected createOptionsFAQHelpMenuLine(options : CallbackButton[][]) {
        const lineNumber = options.length + 1;
        this.insertButton(options, 'FAQ',  new CallbackData(MenuCode.FAQ, undefined), lineNumber);
        this.insertButton(options, 'Help', new CallbackData(MenuCode.Help, undefined), lineNumber);
    }

    protected emptyMenu() : CallbackButton[][] {
        return [];
    }

    protected menuCallback(menuCode : MenuCode) {
        return new CallbackData(menuCode);
    }

    createMenuDisplayRequest(mode : MenuDisplayMode, env : Env) : Request {
        // == null is true when either null or undefined, but not zero
        const menuSpec = Menu.renderMenuSpec(this as unknown as MenuCapabilities, mode);
        const body : any = { 
            chat_id: this.telegramWebhookInfo.chatID,
            text: menuSpec.text,
            parse_mode: menuSpec.parseMode,
            reply_markup: {
                "inline_keyboard": menuSpec.options,
                "resize_keyboard": true
            }
        };
        if (menuSpec.mode === MenuDisplayMode.NewMenu) {
            body.message_id = this.telegramWebhookInfo.messageID;
        }
        const init = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },			
            body: JSON.stringify(body),
        };
        const method = (menuSpec.mode === MenuDisplayMode.UpdateMenu) ? 'editMessageText' : 'newMessage';
        const url = Menu.makeTelegramBotUrl(method, env);
        return new Request(url, init);
    }

	private static makeTelegramBotUrl(methodName : string, env : Env) {
		return `${env.TELEGRAM_BOT_SERVER_URL}/bot${env.TELEGRAM_BOT_TOKEN}/${methodName}`;
	}
    
    private static renderMenuSpec(menu : MenuCapabilities, mode: MenuDisplayMode): MenuSpec {
        const menuSpec : MenuSpec = {
            text : menu.renderText(),
            options : menu.renderOptions(),
            parseMode : menu.parseMode(),
            mode : mode,
            forceReply : menu.forceResponse()
        };
        return menuSpec;
    }      
}

