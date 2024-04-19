import { PositionRequest } from "../positions";
import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuRetryBuySlippageError extends Menu<PositionRequest> implements MenuCapabilities {
    renderText(): string {
        return `Your purchase of $${this.menuData.token.symbol} failed because the slippage tolerance of ${this.menuData.slippagePercent.toFixed(1)}% was exceeded. Would you like to retry with the same slippage?`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Yes", this.menuCallback(MenuCode.TrailingStopLossEditorFinalSubmit));
        this.insertButtonNextLine(options, "No", this.menuCallback(MenuCode.ReturnToPositionRequestEditor));
        return options;
    }
}