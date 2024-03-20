import { PositionRequestAndMaybeQuote } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuConfirmTrailingStopLossPositionRequest extends Menu<PositionRequestAndMaybeQuote> implements MenuCapabilities {
    renderText(): string {
        return [ 
            "<b>Confirm Your Auto-Sell Position Request</b>",
            renderTrailingStopLossRequestMarkdown(this.menuData) 
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "[[EXECUTE THE TRADE]]", new CallbackData(MenuCode.TrailingStopLossEditorFinalSubmit));
        this.insertButtonNextLine(options, "Back", new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}