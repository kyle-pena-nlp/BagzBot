import { CallbackData } from "./callback_data";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";

export class MenuTrailingStopLossAutoRetrySell extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return "Should we retry selling the position if only part of the sell was executed due to slippage tolerance exceeded?"
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