import { CallbackButton, CallbackData, LongTrailingStopLossPositionRequest, MenuCode } from "./common";
import { Menu, MenuCapabilities } from "./menu";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuEditTrailingStopLossPositionRequest extends Menu<LongTrailingStopLossPositionRequest> implements MenuCapabilities {
    renderText(): string {
        return [
            "# Edit Your Auto-Sell Position",
            renderTrailingStopLossRequestMarkdown(this.miscData!!)
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, this.miscData!!.vsToken, new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenu, this.miscData!!.vsToken));
        this.insertButtonNextLine(options, `${this.miscData!!.vsToken} Buy Amount: ${this.miscData!!.vsTokenAmt}`, new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantityKeypad, this.miscData!!.vsTokenAmt.toString()));
        this.insertButtonNextLine(options, `Auto-Sell Trigger Percent: ${this.miscData!!.triggerPercent}%`, new CallbackData(MenuCode.TrailingStopLossTriggerPercentMenu, this.miscData!!.triggerPercent.toString()));
        this.insertButtonNextLine(options, `Slippage Percent: ${this.miscData!!.slippagePercent}%`, new CallbackData(MenuCode.TrailingStopLossSlippageToleranceMenu, this.miscData!!.slippagePercent.toString()));
        this.insertButtonNextLine(options, `Auto-Retry Sell if Slippage Tolerance Exceed? ${this.miscData!!.retrySellIfPartialFill ? 'Yes': 'No'}`, new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellMenu, this.miscData!!.retrySellIfPartialFill.toString()));
        this.insertButtonNextLine(options, `Submit`, new CallbackData(MenuCode.TrailingStopLossConfirmMenu));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        throw new Error("Method not implemented.");
    }
    forceResponse(): boolean {
        throw new Error("Method not implemented.");
    }
}