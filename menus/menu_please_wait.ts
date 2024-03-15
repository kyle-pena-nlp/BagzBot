import { CallbackButton } from "../telegram/callback_button";
import { Menu, MenuCapabilities } from "./menu";

export class MenuPleaseWait extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return `One moment please.`;
    }
    renderOptions(): CallbackButton[][] {
        return [];
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}