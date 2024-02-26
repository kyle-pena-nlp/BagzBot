import { CallbackButton, CallbackData, MenuCode, Position } from "./common";
import { Menu, MenuCapabilities } from "./menu";

export class MenuViewOpenPosition extends Menu<Position> implements MenuCapabilities {
    renderText(): string {
        const line1 = `<b>${this.miscData!!.type.toString()}</b> <i>${this.miscData!!.token}</i> position (${this.miscData!!.tokenAmt.toString()})`
        const line2 = `Current Value in ${this.miscData!!.vsToken}: <b>${this.miscData!!.vsTokenValue.toString()}</b> ${this.miscData!!.vsToken}`
        return [line1,line2].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();

        const closePositionCallbackData = new CallbackData(MenuCode.ClosePositionManuallyAction, this.miscData!!.positionID);
        this.insertButtonNextLine(options, "Close Position Manually", closePositionCallbackData);
        
        const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.miscData!!.positionID);
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