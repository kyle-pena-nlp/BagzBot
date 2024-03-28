import { dSub, toFriendlyString } from "../decimalized";
import { PositionAndMaybeCurrentValue, PositionStatus } from "../positions";
import { CallbackButton } from "../telegram";
import { assertNever } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewOpenPosition extends Menu<PositionAndMaybeCurrentValue> implements MenuCapabilities {
    renderText(): string {
        const position = this.menuData.position;
        const lines = [
            `<i>$${position.token.symbol}</i> position (${toFriendlyString(position.tokenAmt,4)} $${position.token.symbol})`
        ];
        if ('currentValue' in this.menuData) {
            //const currentValueString = toFriendlyString(this.menuData.currentSOLValue,4);
            const originalValue = position.vsTokenAmt;
            const profit = dSub(this.menuData.currentValue,originalValue);
            const profitFriendlyString = toFriendlyString(profit, 4);
            lines.push(`<b>Profit</b>: ${profitFriendlyString} ${position.vsToken.symbol}`);
        }
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();

        if (this.menuData.position.status === PositionStatus.Closing) {
            const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.menuData.position.positionID);
            this.insertButtonNextLine(options, ":refresh: Refresh", refreshPositionCallbackData);
        }
        else if (this.menuData.position.status === PositionStatus.Closed) {
            // no-op
        }
        else if (this.menuData.position.status === PositionStatus.Open) {
            const closePositionCallbackData = new CallbackData(MenuCode.ClosePositionManuallyAction, this.menuData.position.positionID);
            this.insertButtonNextLine(options, ":stop: Stop Monitoring And Sell", closePositionCallbackData);
            
            const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.menuData.position.positionID);
            this.insertButtonNextLine(options, ":refresh: Refresh", refreshPositionCallbackData);
        }
        else {
            assertNever(this.menuData.position.status);
        }

        this.insertBackToMainButtonOnNewLine(options);

        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
    
}