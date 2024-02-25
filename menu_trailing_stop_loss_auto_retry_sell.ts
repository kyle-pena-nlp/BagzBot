import { CallbackButton, CallbackData, MenuCode } from "./common";
import { Menu, MenuCapabilities } from "./menu";

export class MenuTrailingStopLossAutoRetrySell extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        throw new Error("Method not implemented.");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Yes", new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellSubmit, "true"));
        this.insertButtonNextLine(options, "No", new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellSubmit, "false"));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'MarkdownV2';
    }
    forceResponse(): boolean {
        return true;
    }
    
}