import { PositionRequest } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";
import { renderTrailingStopLossRequestMarkdown } from "./trailing_stop_loss_helpers";

export class MenuEditPositionRequest extends Menu<PositionRequest> implements MenuCapabilities {
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
        this.insertButtonNextLine(options, `:brain: ${positionRequest.sellAutoDoubleSlippage ? 'Sell: Auto-Double Slippage': 'Sell: No Auto-Double Slippage'} :brain:`, new CallbackData(MenuCode.PosRequestChooseAutoDoubleSlippageOptions));
        this.insertButtonNextLine(options, `:refresh: Refresh Quote`, new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        this.insertButtonSameLine(options, `:cancel: Cancel`, new CallbackData(MenuCode.Main));
        this.insertButtonSameLine(options, ':help: Help', new CallbackData(MenuCode.EditPositionHelp));
        this.insertButtonNextLine(options, `:sparkle: Submit :sparkle:`, new CallbackData(MenuCode.TrailingStopLossEditorFinalSubmit));
        return options;
    }
    renderURLPreviewNormally(): boolean {
        return false;
    }
    private englishDescriptionOfPosition() : string[] {
        const lines = [];
        lines.push(`<b>Your Position Setup</b>`);
        lines.push(`:bullet: The bot will convert the specified amount of ${this.vsTokenSymbol()} into ${this.tokenSymbol()}`);
        lines.push(`:bullet: The bot will monitor the value of your ${this.tokenSymbol()} position`);
        lines.push(`:bullet: When the value of your position dips <b>${this.menuData.triggerPercent}%</b> below its highest recorded value, the ${this.tokenSymbol()} will be automatically converted back to ${this.vsTokenSymbol()}`)
        lines.push(`:bullet: <i>(That's how you lock in your gains)</i>`)
        lines.push(`:bullet: You can edit the Trigger Percent by using the menu below.`)
        return lines;
    }
    private tokenSymbol() {
        return this.menuData.token.symbol;
    }
    private vsTokenSymbol() {
        return this.menuData.vsToken.symbol;
    }
}