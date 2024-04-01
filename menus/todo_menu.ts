import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTODO extends Menu<MenuCode> implements MenuCapabilities {
    renderText(): string {
        return 'This feature is UNDER CONSTRUCTION.';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Back", this.menuCallback(this.menuData));
        return options;
    }
}