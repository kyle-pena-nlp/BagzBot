import { CallbackData } from "./callback_data";
import { Env, UserData } from "./common";

import { makeJSONRequest } from "./http_helpers";
import { escapeTGText, makeTelegramBotUrl  } from "./telegram_helpers";
import { TelegramWebhookInfo } from "./telegram_webhook_info";

export enum MenuDisplayMode {
	UpdateMenu,
	NewMenu
};



export enum MenuCode {
	Main = "Main",
	CreateWallet = "CreateWallet",
	Wallet = "Wallet",
	ListPositions = "ListPositions",
	Invite = "Invite",
	FAQ = "FAQ",
	Help = "Help",
	Error = "Error",
	
	PleaseEnterToken = "PleaseEnterToken",
	TransferFunds = "TransferFunds",
	RefreshWallet = "RefreshWallet",
	ExportWallet = "ExportWallet",
	ViewOpenPosition = "ViewOpenPosition",
	ClosePositionManuallyAction = "ClosePositionManuallyAction",

	// Trailing Stop Loss: set buy quantity in vsToken units
	TrailingStopLossEntryBuyQuantityMenu = "TSL.EntryBuyQuantityMenu",
	TrailingStopLossEnterBuyQuantityKeypad = "TSL.EnterBuyQuantityKeypad",
	TrailingStopLossEnterBuyQuantitySubmit = "TSL.EnterBuyQuantitySubmit",

	// Trailing Stop Loss: set vsToken UI
	TrailingStopLossPickVsTokenMenu = "TSL.PickVsToken",
	TrailingStopLossPickVsTokenMenuSubmit = "TSL.PickVsTokenMenuSubmit",
	
	// Trailing Stop Loss: set slippage tolerance UI
	TrailingStopLossSlippagePctMenu = "TSL.SlippagePctMenu",
	TrailingStopLossCustomSlippagePctKeypad = "TSL.CustomSlippagePctKeypad",
	TrailingStopLossCustomSlippagePctKeypadSubmit = "TSL.CustomSlippagePctKeypad",

	// Trailing Stop Loss: set trigger percent UI
	TrailingStopLossTriggerPercentMenu = "TSL.TriggerPercentMenu",
	TrailingStopLossCustomTriggerPercentKeypad = "TSL.CustomTriggerPercentKeypad", 
	TrailingStopLossCustomTriggerPercentKeypadSubmit = "TSL.CustomTriggerPercentKeypadSubmit", 

	// Trailing Stop Loss: auto-retry sell if slippage tolerance exceeded?
	TrailingStopLossChooseAutoRetrySellMenu = "TSL.ChooseAutoRetrySellMenu",
	TrailingStopLossChooseAutoRetrySellSubmit = "TSL.ChooseAutoRetrySellSubmit",

	
	TrailingStopLossConfirmMenu = "TSL.ConfirmMenu",
	TrailingStopLossEditorFinalSubmit = "TSL.EditorFinalSubmit",

	Close = "Close"
};

export interface MenuSpec {
	text: string,
	options : Array<Array<CallbackButton>>
	parseMode : 'HTML'|'MarkdownV2'
	mode : MenuDisplayMode
	forceReply : boolean
};

export interface CallbackButton {
	text: string,
	callback_data : string
};

export interface MenuCapabilities {
    renderText() : string;
    renderOptions() : CallbackButton[][];
    parseMode() : 'MarkdownV2'|'HTML'
    forceResponse() : boolean
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
            parse_mode: menuSpec.parseMode,
            reply_markup: {
                "inline_keyboard": menuSpec.options
            }
        };
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
            message_id: messageID,
            reply_markup: {
                "inline_keyboard": menuSpec.options
            }
        };
        const method = 'editMessageText';
        const url = makeTelegramBotUrl(method, env);
        const request = makeJSONRequest(url, body);
        return request;
    }

    private static renderMenuSpec(menu : MenuCapabilities, mode: MenuDisplayMode): MenuSpec {
        const menuSpec : MenuSpec = {
            text : escapeTGText(menu.renderText(), menu.parseMode()),
            options : menu.renderOptions(),
            parseMode : menu.parseMode(),
            mode : mode,
            forceReply : menu.forceResponse()
        };
        return menuSpec;
    }
}

export abstract class Menu<T> extends BaseMenu {

    miscData   : T|undefined

    constructor(miscData? : T) {
        super();
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
