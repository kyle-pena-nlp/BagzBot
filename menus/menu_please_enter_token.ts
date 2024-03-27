import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";

export class MenuPleaseEnterToken extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return "Enter a token.";
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
}