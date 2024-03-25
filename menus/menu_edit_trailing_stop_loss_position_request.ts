import { PositionRequest } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuEditTrailingStopLossPositionRequest extends Menu<PositionRequest> implements MenuCapabilities {
    renderText(): string {
        return [
            `<b>Create Position</b>`,
            renderTrailingStopLossRequestMarkdown(this.menuData),
            '<i>Click on any setting below to edit before Submitting</i>'
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const positionRequest = this.menuData;
        //this.insertButtonNextLine(options, `Buying With: ${positionRequest.vsToken.symbol}`, new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenu, positionRequest.vsToken.symbol));
        this.insertButtonNextLine(options, `Change Token`, new CallbackData(MenuCode.EditPositionChangeToken));
        this.insertButtonNextLine(options, `${positionRequest.vsTokenAmt} ${positionRequest.vsToken.symbol}`, new CallbackData(MenuCode.TrailingStopLossEntryBuyQuantityMenu, positionRequest.vsTokenAmt.toString()));
        this.insertButtonSameLine(options, `${positionRequest.triggerPercent}% Trigger`, new CallbackData(MenuCode.TrailingStopLossTriggerPercentMenu, positionRequest.triggerPercent.toString()));
        this.insertButtonSameLine(options, `${positionRequest.slippagePercent}% Slippage`, new CallbackData(MenuCode.TrailingStopLossSlippagePctMenu, positionRequest.slippagePercent.toString()));
        //this.insertButtonNextLine(options, `${positionRequest.retrySellIfSlippageExceeded ? 'Auto Retry Sell': 'Do Not Auto Retry Sell'}`, new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellMenu, positionRequest.retrySellIfSlippageExceeded.toString()));
        this.insertButtonNextLine(options, `Refresh Quote`, new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        this.insertButtonSameLine(options, 'Cancel', new CallbackData(MenuCode.Main));
        this.insertButtonNextLine(options, `Submit`, new CallbackData(MenuCode.TrailingStopLossEditorFinalSubmit));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}