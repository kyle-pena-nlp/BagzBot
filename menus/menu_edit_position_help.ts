import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuEditPositionHelp extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return 'TODO: HELP MESSAGE';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Back", new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }

}