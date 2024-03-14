import { Menu, MenuCapabilities } from "./menu";
import { CallbackButton } from "../telegram/callback_button";

export class MenuPleaseEnterToken extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return "Enter a token."
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertReturnToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}