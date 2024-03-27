import { PositionRequest } from "../positions";
import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuRetryBuy extends Menu<PositionRequest> implements MenuCapabilities {
    renderText(): string {
        return `Would you like to retry opening your $${this.menuData.token.symbol} position?`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Yes", this.menuCallback(MenuCode.TrailingStopLossEditorFinalSubmit));
        this.insertButtonNextLine(options, "No", this.menuCallback(MenuCode.Main));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }

}