import { CallbackButton, CallbackData, LongTrailingStopLossPositionRequest, MenuCode } from "./common";
import { Menu, MenuCapabilities } from "./menu";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuConfirmTrailingStopLossPositionRequest extends Menu<LongTrailingStopLossPositionRequest> implements MenuCapabilities {
    renderText(): string {
        return [ 
            "# Confirm Your Auto-Sell Position Request",
            renderTrailingStopLossRequestMarkdown(this.miscData!!) 
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Confirm", new CallbackData(MenuCode.TrailingStopLossEditorFinalSubmit));
        this.insertReturnToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'MarkdownV2';
    }
    forceResponse(): boolean {
        return true;
    }
}