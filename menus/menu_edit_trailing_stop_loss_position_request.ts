import { CallbackData } from "./callback_data";
import { PositionRequest } from "../positions/positions";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuEditTrailingStopLossPositionRequest extends Menu<PositionRequest> implements MenuCapabilities {
    renderText(): string {
        return [
            `<b>Edit Your ${this.miscData!!.token.symbol} Auto-Sell Position</b>`,
            renderTrailingStopLossRequestMarkdown(this.miscData!!),
            '<i>Click on any setting below to edit before Submitting</i>'
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, `Buying With: ${this.miscData!!.vsToken.symbol}`, new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenu, this.miscData!!.vsToken.symbol));
        this.insertButtonNextLine(options, `${this.miscData!!.vsToken.symbol} Buy Amount: ${this.miscData!!.vsTokenAmt}`, new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantityKeypad, this.miscData!!.vsTokenAmt.toString()));
        this.insertButtonNextLine(options, `Auto-Sell Trigger Percent: ${this.miscData!!.triggerPercent}%`, new CallbackData(MenuCode.TrailingStopLossTriggerPercentMenu, this.miscData!!.triggerPercent.toString()));
        this.insertButtonNextLine(options, `Slippage Percent: ${this.miscData!!.slippagePercent}%`, new CallbackData(MenuCode.TrailingStopLossSlippagePctMenu, this.miscData!!.slippagePercent.toString()));
        this.insertButtonNextLine(options, `Auto-Retry Sell if Slippage Tolerance Exceed? ${this.miscData!!.retrySellIfSlippageExceeded ? 'Yes': 'No'}`, new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellMenu, this.miscData!!.retrySellIfSlippageExceeded.toString()));
        this.insertButtonNextLine(options, `Submit`, new CallbackData(MenuCode.TrailingStopLossConfirmMenu));
        this.insertButtonNextLine(options, 'Close', new CallbackData(MenuCode.Close));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}