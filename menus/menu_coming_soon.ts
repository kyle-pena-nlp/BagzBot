import { CallbackButton } from "../telegram";
import { logoHack } from "./logo_hack";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuComingSoon extends Menu<string> implements MenuCapabilities {
    renderText(): string {
        const lines : string[] = [];
        lines.push(`${logoHack()}<b><u>This Feature Is Coming Soon!</u></b>`);
        lines.push("");
        lines.push(`<blockquote>${this.menuData}</blockquote>`);
        lines.push("");
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, `:back: Back`, this.menuCallback(MenuCode.Main));
        return options;
    }
    renderURLPreviewNormally(): boolean {
        return false;
    }
}