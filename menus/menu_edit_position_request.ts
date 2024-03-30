import { toFriendlyString } from "../decimalized";
import { PositionRequest } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuEditTrailingStopLossPositionRequest extends Menu<PositionRequest> implements MenuCapabilities {
    renderText(): string {
        return [
            `<b>:sparkle: Create Position</b>`,
            renderTrailingStopLossRequestMarkdown(this.menuData),
            "",
            ...this.englishDescriptionOfPosition(),
            "",
            '<i>Click on any setting below to edit before Submitting</i>'
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const positionRequest = this.menuData;
        //this.insertButtonNextLine(options, `Buying With: ${positionRequest.vsToken.symbol}`, new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenu, positionRequest.vsToken.symbol));
        this.insertButtonNextLine(options, `:pencil: Change Token`, new CallbackData(MenuCode.EditPositionChangeToken));
        this.insertButtonNextLine(options, `:dollars: ${positionRequest.vsTokenAmt} ${positionRequest.vsToken.symbol}`, new CallbackData(MenuCode.TrailingStopLossEntryBuyQuantityMenu, positionRequest.vsTokenAmt.toString()));
        this.insertButtonSameLine(options, `:chart_down: ${positionRequest.triggerPercent}% Trigger`, new CallbackData(MenuCode.TrailingStopLossTriggerPercentMenu, positionRequest.triggerPercent.toString()));
        this.insertButtonSameLine(options, `:twisted_arrows: ${positionRequest.slippagePercent}% Slippage`, new CallbackData(MenuCode.TrailingStopLossSlippagePctMenu, positionRequest.slippagePercent.toString()));
        //this.insertButtonNextLine(options, `${positionRequest.retrySellIfSlippageExceeded ? 'Auto Retry Sell': 'Do Not Auto Retry Sell'}`, new CallbackData(MenuCode.TrailingStopLossChooseAutoRetrySellMenu, positionRequest.retrySellIfSlippageExceeded.toString()));
        this.insertButtonNextLine(options, `:refresh: Refresh Quote`, new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        this.insertButtonSameLine(options, `Cancel`, new CallbackData(MenuCode.Main));
        this.insertButtonSameLine(options, ':help: Help', new CallbackData(MenuCode.EditPositionHelp));
        this.insertButtonNextLine(options, `:sparkle: Submit :sparkle:`, new CallbackData(MenuCode.TrailingStopLossEditorFinalSubmit));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return false;
    }
    private englishDescriptionOfPosition() : string[] {
        const lines = [];
        lines.push(`<b>Your Position Setup</b>`);
        lines.push(`:bullet: The bot will convert the specified amount of ${this.vsTokenSymbol()} into ${this.tokenSymbol()}`);
        lines.push(`:bullet: The bot will monitor the value of your ${this.tokenSymbol()} position`);
        lines.push(`:bullet: When the value of your position dips ${this.menuData.triggerPercent}% below its highest recorded value (Trigger), the ${this.tokenSymbol()} will be automatically converted back to ${this.vsTokenSymbol()}`)
        lines.push(`:bullet: You can edit the Trigger Percent by using the menu below.`)
        return lines;
    }
    private tokenAmountString() {
        return toFriendlyString(this.menuData.quote.outTokenAmt,4, { addCommas: false });
    }
    private tokenSymbol() {
        return this.menuData.token.symbol;
    }
    private vsTokenAmountString() {
        return toFriendlyString(this.menuData.quote.inTokenAmt,4, { addCommas: false });
    }
    private vsTokenSymbol() {
        return this.menuData.vsToken.symbol;
    }
}