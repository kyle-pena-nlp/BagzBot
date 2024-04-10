import { CallbackButton } from "../telegram";
import { Structural, writeIndentedToString } from "../util";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewObj<T extends (Structural|Structural[])> extends Menu<{ isAdmin : boolean, data: T }> implements MenuCapabilities {
    renderText(): string {
        if (!this.menuData.isAdmin) {
            return '';
        }
        const summary = writeIndentedToString(this.menuData.data);
        return summary;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, ":back: Back", this.menuCallback(MenuCode.Main));
        return options;
    }
    
}