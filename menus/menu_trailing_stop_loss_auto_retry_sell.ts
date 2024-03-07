import { CallbackData } from "./callback_data";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";

export class MenuTrailingStopLossAutoRetrySell extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return "If the slippage exceeded when trying to close the position, should we retry selling the position when the positions auto-sell conditions are met?"
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Yes", new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellSubmit, "true"));
        this.insertButtonNextLine(options, "No", new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellSubmit, "false"));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
    
}