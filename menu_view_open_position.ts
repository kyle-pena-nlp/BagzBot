import { CallbackButton, CallbackData, MenuCode, Position } from "./common";
import { Menu, MenuCapabilities } from "./menu";

export class MenuViewOpenPosition extends Menu<Position> implements MenuCapabilities {
    renderText(): string {
        const line1 = `**${this.miscData!!.type.toString()}** *${this.miscData!!.token}* position (${this.miscData!!.tokenAmt.toString()})`
        const line2 = `Current Value in ${this.miscData!!.vsToken}: **${this.miscData!!.vsTokenValue.toString()}** ${this.miscData!!.vsToken}`
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
        return 'MarkdownV2';
    }
    forceResponse(): boolean {
        return true;
    }
    
}