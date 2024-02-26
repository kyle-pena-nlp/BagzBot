import { CallbackButton } from "./common";
import { Menu, MenuCapabilities } from "./menu";

export class MenuError extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return "There has been an error.";
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertReturnToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }    
    forceResponse() : boolean {
        return true;
    }
}