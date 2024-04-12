import { Env } from "../env";
import { CallbackData } from "./callback_data";
import { MenuCode } from "./menu_code";

import { makeJSONRequest } from "../http";
import { fetchAndReadResponse as safeFetchAndReadResponse } from "../http/http_helpers";
import { CallbackButton, escapeTGText, makeTelegramBotUrl, subInEmojis, subInEmojisOnButtons } from "../telegram";

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
    // TODO: finish the implementation of sendPhoto / media (to support 'cards')
    photo : string|null
}

export interface MenuCapabilities {
    renderText() : string;
    renderOptions() : CallbackButton[][];
    parseMode() : 'MarkdownV2'|'HTML'
    renderURLPreviewNormally() : boolean
    photo(): string|null
    // TODO: factor things out of the abominable switch statement and into this:
    //handleCallback(incomingMenuCode : MenuCode, params : CallbackHandlerParams, context : FetchEvent, env : Env);
}

export abstract class BaseMenu {

    isMenu : boolean = true

    constructor() {
    }

    async sendToTG(params: { chatID : number, messageID : number }|{ chatID : number }, env : Env) : Promise<boolean> {
        const startMS = Date.now();
        
        // sometimes, updating a menu takes more than one request (only if sending photos)

        let request : Request|null = null;

        // get Requests used to build the menu
        if ('messageID' in params) {
            request = this.getUpdateExistingMenuRequest(params.chatID, params.messageID, env);
        }
        else {
            request = this.getCreateNewMenuRequest(params.chatID, env);
        }

        const response = await safeFetchAndReadResponse(request);

        if (response == null || !response.ok) {
            return false;
        }

        await this.maybeSendPhoto(response.body, env);

        //logDebug(`Sent menu requests in ${Date.now() - startMS}ms`);
        return true;
    }

    private async maybeSendPhoto(response : any, env: Env) {
        const photo = (this as unknown as MenuCapabilities).photo();

        if (photo != null) {
            const messageID = response.body?.message_id;
            const chatID = response.body?.chat.id;
            if (messageID != null) {
                const url = makeTelegramBotUrl('editMessageMedia', env);
                const body : any = {
                    chat_id : chatID,
                    message_id : messageID,
                    media : {
                        type : 'photo',
                        media : photo
                    }
                };
                const request = makeJSONRequest(url, body);
                const response = safeFetchAndReadResponse(request);
            }
        }
    }

    private getCreateNewMenuRequest(chatID : number, env:  Env) : Request {
        // == null is true when either null or undefined, but not zero
        const menuSpec = BaseMenu.renderMenuSpec(this as unknown as MenuCapabilities, MenuDisplayMode.NewMenu);
        const body = this.createRequestBodyForMenu(menuSpec, chatID);
        const method = 'sendMessage';
        const url = makeTelegramBotUrl(method, env);
        const request = makeJSONRequest(url, body);
        return request;        
    }

    private getUpdateExistingMenuRequest(chatID : number, messageID : number, env : Env) : Request {
        const menuSpec = BaseMenu.renderMenuSpec(this as unknown as MenuCapabilities, MenuDisplayMode.UpdateMenu);
        menuSpec.photo = null; // i don't support sending photos with edited messages yet. would require a refactor.
        const body = this.createRequestBodyForMenu(menuSpec, chatID);
        body.message_id = messageID;
        const method = 'editMessageText';
        const url = makeTelegramBotUrl(method, env);
        const request = makeJSONRequest(url, body);
        return request;
    }

    private createRequestBodyForMenu(menuSpec: MenuSpec, chatID : number) : any {
        const body : any = { 
            chat_id: chatID,
            parse_mode: menuSpec.parseMode
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
        // TG gets upset if you update a message to the same exact content.  This makes all content unique.
        const invisibleNonce = `<a href="t.me/share?url=google.com&text=${Date.now()}">\u200B</a>`
        body.text = menuSpec.text + invisibleNonce;
        return body;
    }

    private static renderMenuSpec(menu : MenuCapabilities, mode: MenuDisplayMode): MenuSpec {
        const menuSpec : MenuSpec = {
            text : subInEmojis(escapeTGText(menu.renderText(), menu.parseMode())),
            options : subInEmojisOnButtons(menu.renderOptions()),
            parseMode : menu.parseMode(),
            mode : mode,
            renderLinkPreviewAsIcon : !menu.renderURLPreviewNormally(),
            photo: menu.photo()
        };
        return menuSpec;
    }
}

// export EnvWithNoSecrets

export abstract class Menu<T> extends BaseMenu {

    menuData   : T;

    // ENV with no secrets as parameter.
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

    photo() : string|null {
        return null;
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

