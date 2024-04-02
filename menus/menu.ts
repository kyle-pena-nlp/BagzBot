import { Env } from "../env";
import { CallbackData } from "./callback_data";
import { MenuCode } from "./menu_code";

import { CallbackButton, escapeTGText, makeTelegramBotUrl, subInEmojis, subInEmojisOnButtons } from "../telegram";
import { makeJSONRequest } from "../util";

export enum MenuDisplayMode {
	UpdateMenu,
	NewMenu
}

export interface MenuSpec {
	text: string,
	options : Array<Array<CallbackButton>>
	parseMode : 'HTML'|'MarkdownV2'
	mode : MenuDisplayMode
	renderLinkPreviewAsIcon : boolean
}

export interface MenuCapabilities {
    renderText() : string;
    renderOptions() : CallbackButton[][];
    parseMode() : 'MarkdownV2'|'HTML'
    renderURLPreviewNormally() : boolean
}

export abstract class BaseMenu {

    constructor() {
    }

    getCreateNewMenuRequest(chatID : number, env:  Env) {
        // == null is true when either null or undefined, but not zero
        const menuSpec = BaseMenu.renderMenuSpec(this as unknown as MenuCapabilities, MenuDisplayMode.NewMenu);
        const body : any = { 
            chat_id: chatID,
            text: menuSpec.text,
            parse_mode: menuSpec.parseMode
        };
        if (menuSpec.options.length > 0 && menuSpec.options[0].length > 0) {
            body.reply_markup = {
                "inline_keyboard": menuSpec.options
            };
        }
        const method = 'sendMessage';
        const url = makeTelegramBotUrl(method, env);
        const request = makeJSONRequest(url, body);
        return request;        
    }

    getUpdateExistingMenuRequest(chatID : number, messageID : number, env : Env) {
        const menuSpec = BaseMenu.renderMenuSpec(this as unknown as MenuCapabilities, MenuDisplayMode.UpdateMenu);
        const body : any = { 
            chat_id: chatID,
            text: menuSpec.text,
            parse_mode: menuSpec.parseMode,
            message_id: messageID
        };
        if (menuSpec.renderLinkPreviewAsIcon) {
            body.link_preview_options = {
                prefer_small_media: true,
                show_above_text : true
            }
        }
        if (menuSpec.options.length > 0 && menuSpec.options[0].length > 0) {
            body.reply_markup = {
                "inline_keyboard": menuSpec.options
            };
        }
        const method = 'editMessageText';
        const url = makeTelegramBotUrl(method, env);
        const request = makeJSONRequest(url, body);
        return request;
    }

    private static renderMenuSpec(menu : MenuCapabilities, mode: MenuDisplayMode): MenuSpec {
        const menuSpec : MenuSpec = {
            text : subInEmojis(escapeTGText(menu.renderText(), menu.parseMode())),
            options : subInEmojisOnButtons(menu.renderOptions()),
            parseMode : menu.parseMode(),
            mode : mode,
            renderLinkPreviewAsIcon : !menu.renderURLPreviewNormally()
        };
        return menuSpec;
    }
}

export abstract class Menu<T> extends BaseMenu {

    menuData   : T;

    constructor(miscData : T) {
        super();
        this.menuData = miscData;
    }

    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    
    renderURLPreviewNormally(): boolean {
        return true;
    }

    protected insertButton(options : CallbackButton[][], text : string, callbackData : CallbackData, lineNumber : number) {
        const button : CallbackButton = { text: text, callback_data : callbackData.toString() };
        while (options.length < lineNumber) {
            options.push([]);
        }
        options[lineNumber-1].push(button);
    }

    protected insertButtonSameLine(options : CallbackButton[][], text : string, callbackData : CallbackData) {
        if (options.length == 0) {
            options.push([]);
        }
        const lineNumber = options.length;
        this.insertButton(options, text, callbackData, lineNumber);
    }

    protected insertButtonNextLine(options : CallbackButton[][], text : string, callbackData : CallbackData) {
        const lineNumber = options.length + 1;
        this.insertButton(options, text, callbackData, lineNumber);
    }

    protected insertBackToMainButtonOnNewLine(options : CallbackButton[][]) {
        const lineNumber = options.length + 1;
        const callbackData = new CallbackData(MenuCode.Main, undefined);
        this.insertButton(options, ':back: Back', callbackData, lineNumber);
    }

    protected insertCloseButtonNextLine(options : CallbackButton[][]) {
        const lineNumber = options.length + 1;
        this.insertButton(options, "Close", this.menuCallback(MenuCode.Close), lineNumber);
    }

    protected emptyMenu() : CallbackButton[][] {
        return [];
    }

    protected menuCallback(menuCode : MenuCode) {
        return new CallbackData(menuCode);
    }
}

