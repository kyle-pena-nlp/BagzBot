import { PositionRequest } from "../positions/positions";
import { PositionRequestAndQuote } from "../positions/position_request_and_quote";
import { CallbackData } from "./callback_data";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuConfirmTrailingStopLossPositionRequest extends Menu<PositionRequestAndQuote> implements MenuCapabilities {
    renderText(): string {
        return [ 
            "<b>Confirm Your Auto-Sell Position Request</b>",
            renderTrailingStopLossRequestMarkdown(this.menuData) 
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Confirm And Place Trade", new CallbackData(MenuCode.TrailingStopLossEditorFinalSubmit));
        this.insertButtonNextLine(options, "Cancel", new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}