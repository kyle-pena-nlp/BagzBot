import { CallbackData } from "./callback_data";
import { PositionRequest } from "../positions/positions";
import { PositionRequestAndQuote } from "../positions/position_request_and_quote";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuEditTrailingStopLossPositionRequest extends Menu<PositionRequestAndQuote> implements MenuCapabilities {
    renderText(): string {
        const positionRequest = this.menuData.positionRequest;
        return [
            `<b>Edit Your ${positionRequest.token.symbol} Auto-Sell Position</b>`,
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