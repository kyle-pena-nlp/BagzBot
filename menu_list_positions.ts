import { CallbackButton, CallbackData, MenuCode, PositionDisplayInfo } from "./common";
import { Menu, MenuCapabilities } from "./menu";

export class MenuListPositions extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return `You have ${this.userData.positions.length} open positions`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        for (const position of this.userData.positions) {
            const positionLabel = `${position.token} - ${position.amount.toString()}`
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