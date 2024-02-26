import { CallbackButton } from "./common";
import { Menu, MenuCapabilities } from "./menu";

export class MenuTODO extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return 'This feature is UNDER CONSTRUCTION.'
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