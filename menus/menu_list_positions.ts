import { Position } from "../positions/positions";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { CallbackButton } from "../telegram/callback_button";
import { MenuCode } from "./menu_code";

export class MenuListPositions extends Menu<Position[]> implements MenuCapabilities {
    renderText(): string {
        return `You have ${this.menuData.length} open positions`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        for (const position of this.menuData) {
            const positionLabel = `${position.token.symbol} - ${position.tokenAmt.toString()}`
            const callbackData = new CallbackData(MenuCode.ViewOpenPosition, position.positionID);
            this.insertButtonNextLine(options, positionLabel, callbackData);
        }
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