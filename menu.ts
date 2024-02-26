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

export abstract class BaseMenu {

    telegramWebhookInfo : TelegramWebhookInfo

    constructor(telegramWebhookInfo : TelegramWebhookInfo) {
        this.telegramWebhookInfo = telegramWebhookInfo;
    }

    createMenuDisplayRequest(mode : MenuDisplayMode, env : Env) : Request {
        // == null is true when either null or undefined, but not zero
        const menuSpec = BaseMenu.renderMenuSpec(this as unknown as MenuCapabilities, mode);
        const body : any = { 
            chat_id: this.telegramWebhookInfo.chatID,
            text: menuSpec.text,
            parse_mode: menuSpec.parseMode,
            reply_markup: {
                "inline_keyboard": menuSpec.options
            }
        };
        if (menuSpec.mode === MenuDisplayMode.UpdateMenu) {
            body.message_id = this.telegramWebhookInfo.messageID;
        }
        const bodyJSONString = JSON.stringify(body);
        const init = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },			
            body: bodyJSONString,
        };
        const method = (menuSpec.mode === MenuDisplayMode.UpdateMenu) ? 'editMessageText' : 'sendMessage';
        const url = BaseMenu.makeTelegramBotUrl(method, env);
        return new Request(url, init);
    }

    private static renderMenuSpec(menu : MenuCapabilities, mode: MenuDisplayMode): MenuSpec {
        const menuSpec : MenuSpec = {
            text : BaseMenu.escape(menu.renderText(), menu.parseMode()),
            options : menu.renderOptions(),
            parseMode : menu.parseMode(),
            mode : mode,
            forceReply : menu.forceResponse()
        };
        return menuSpec;
    } 
    
	private static makeTelegramBotUrl(methodName : string, env : Env) {
		return `${env.TELEGRAM_BOT_SERVER_URL}/bot${env.TELEGRAM_BOT_TOKEN}/${methodName}`;
	}

    private static escape(text : string, parseMode : 'MarkdownV2'|'HTML') : string {
        if (parseMode == 'MarkdownV2') {
            // TODO: replace with regex
            const pattern = /\[|]|\(|\)|~|`|>|#|\+|-|=|\||{|}|\.|!/g;
            text = text.replace(pattern, function (substring) {
                return '\\' + substring;
            })
        }
        return text;
    }
}

export abstract class Menu<T> extends BaseMenu {

    userData   : UserData
    miscData   : T|undefined

    constructor(telegramWebhookInfo : TelegramWebhookInfo, userData : UserData, miscData? : T) {
        super(telegramWebhookInfo);
        this.userData = userData;
        this.miscData = miscData;
    }

    protected insertButton(options : CallbackButton[][], text : string, callbackData : CallbackData, lineNumber : number) {
        const button : CallbackButton = { text: text, callback_data : callbackData.toString() };
        while (options.length < lineNumber) {
            options.push([]);
        }
        options[lineNumber-1].push(button);
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



    
     


}

