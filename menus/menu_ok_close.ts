import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuOKClose extends Menu<string> implements MenuCapabilities {
    renderText(): string {
        return this.menuData;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "OK", this.menuCallback(MenuCode.Close));
        return options;
    }
}