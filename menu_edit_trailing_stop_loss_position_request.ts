import { CallbackData } from "./callback_data";
import { LongTrailingStopLossPositionRequest } from "./common";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuEditTrailingStopLossPositionRequest extends Menu<LongTrailingStopLossPositionRequest> implements MenuCapabilities {
    renderText(): string {
        return [
            "<b>Edit Your Auto-Sell Position</b>",
            renderTrailingStopLossRequestMarkdown(this.miscData!!)
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, this.miscData!!.vsToken, new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenu, this.miscData!!.vsToken));
        this.insertButtonNextLine(options, `Edit ${this.miscData!!.vsToken} Buy Amount: ${this.miscData!!.vsTokenAmt}`, new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantityKeypad, this.miscData!!.vsTokenAmt.toString()));
        this.insertButtonNextLine(options, `Edit Auto-Sell Trigger Percent: ${this.miscData!!.triggerPercent}%`, new CallbackData(MenuCode.TrailingStopLossTriggerPercentMenu, this.miscData!!.triggerPercent.toString()));
        this.insertButtonNextLine(options, `Edit Slippage Percent: ${this.miscData!!.slippagePercent}%`, new CallbackData(MenuCode.TrailingStopLossSlippagePctMenu, this.miscData!!.slippagePercent.toString()));
        this.insertButtonNextLine(options, `Edit Auto-Retry Sell if Slippage Tolerance Exceed? ${this.miscData!!.retrySellIfPartialFill ? 'Yes': 'No'}`, new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellMenu, this.miscData!!.retrySellIfPartialFill.toString()));
        this.insertButtonNextLine(options, `Submit`, new CallbackData(MenuCode.TrailingStopLossConfirmMenu));
        this.insertButtonNextLine(options, 'Cancel', new CallbackData(MenuCode.Main));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}