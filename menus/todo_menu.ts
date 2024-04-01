import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";

export class MenuTODO extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return 'This feature is UNDER CONSTRUCTION.';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
}