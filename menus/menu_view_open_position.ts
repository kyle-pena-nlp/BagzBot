import { dSub, toFriendlyString } from "../decimalized";
import { PositionAndMaybeCurrentValue } from "../positions";
import { CallbackButton } from "../telegram";
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

        const closePositionCallbackData = new CallbackData(MenuCode.ClosePositionManuallyAction, this.menuData.position.positionID);
        this.insertButtonNextLine(options, "Close Position Manually", closePositionCallbackData);
        
        const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.menuData.position.positionID);
        this.insertButtonNextLine(options, "Refresh", refreshPositionCallbackData);

        this.insertBackToMainButtonOnNewLine(options);

        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
    
}