import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewOpenPosition extends Menu<Position> implements MenuCapabilities {
    renderText(): string {
        const line1 = `<b>${this.menuData.type.toString()}</b> <i>${this.menuData.token.symbol}</i> position (${this.menuData.tokenAmt.toString()})`;
        const line2 = ``;//`Current Value in ${this.miscData.vsToken.symbol}: <b>${this.miscData.vsTokenValue.toString()}</b> ${this.miscData.vsToken.symbol}`
        return [line1,line2].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();

        const closePositionCallbackData = new CallbackData(MenuCode.ClosePositionManuallyAction, this.menuData.positionID);
        this.insertButtonNextLine(options, "Close Position Manually", closePositionCallbackData);
        
        const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.menuData.positionID);
        this.insertButtonNextLine(options, "Refresh", refreshPositionCallbackData);

        this.insertReturnToMainButtonOnNewLine(options);

        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
    
}