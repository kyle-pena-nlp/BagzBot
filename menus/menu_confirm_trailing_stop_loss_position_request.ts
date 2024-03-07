import { CallbackData } from "./callback_data";
import { LongTrailingStopLossPositionRequest } from "../common";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuConfirmTrailingStopLossPositionRequest extends Menu<LongTrailingStopLossPositionRequest> implements MenuCapabilities {
    renderText(): string {
        return [ 
            "<b>Confirm Your Auto-Sell Position Request</b>",
            renderTrailingStopLossRequestMarkdown(this.miscData!!) 
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