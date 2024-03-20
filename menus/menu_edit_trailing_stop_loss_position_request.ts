import { PositionRequestAndMaybeQuote, PositionRequestAndQuote } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuEditTrailingStopLossPositionRequest extends Menu<PositionRequestAndMaybeQuote> implements MenuCapabilities {
    renderText(): string {
        const positionRequest = this.menuData.positionRequest;
        return [
            `<b>[[NEW AUTO-SELL POSITION]]</b>`,
            renderTrailingStopLossRequestMarkdown(this.menuData),
            '<i>Click on any setting below to edit before Submitting</i>'
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const positionRequest = this.menuData.positionRequest;
        this.insertButtonNextLine(options, `[[REVIEW AND SUBMIT]]`, new CallbackData(MenuCode.TrailingStopLossConfirmMenu));
        this.insertButtonNextLine(options, `Buying With: ${positionRequest.vsToken.symbol}`, new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenu, positionRequest.vsToken.symbol));
        this.insertButtonNextLine(options, `${positionRequest.vsToken.symbol} Buy Amount: ${positionRequest.vsTokenAmt}`, new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantityKeypad, positionRequest.vsTokenAmt.toString()));
        this.insertButtonNextLine(options, `Auto-Sell Trigger Percent: ${positionRequest.triggerPercent}%`, new CallbackData(MenuCode.TrailingStopLossTriggerPercentMenu, positionRequest.triggerPercent.toString()));
        this.insertButtonNextLine(options, `Slippage Percent: ${positionRequest.slippagePercent}%`, new CallbackData(MenuCode.TrailingStopLossSlippagePctMenu, positionRequest.slippagePercent.toString()));
        this.insertButtonNextLine(options, `Auto-Retry Sell if Slippage Tolerance Exceed? ${positionRequest.retrySellIfSlippageExceeded ? 'Yes': 'No'}`, new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellMenu, positionRequest.retrySellIfSlippageExceeded.toString()));
        this.insertButtonNextLine(options, `Refresh`, new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        this.insertButtonNextLine(options, 'Cancel', new CallbackData(MenuCode.Close));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}