import { asTokenPrice } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewDeactivatedPositions extends Menu<Position[]>  implements MenuCapabilities {
    renderText(): string {
        const lines = [`<b><u>Deactivated Positions</u></b>
:bullet: Deactivated positions are not price monitored and will not be automatically sold. 
:bullet: You can reactivate a position by opening it and clicking 'Reactivate'.`];
        if (this.menuData.length == 0) {
            lines.push("");
            lines.push("You have 0 deactivated positions.");
        }
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        for (const position of this.menuData) {
            this.insertViewDeactivatedPositionButton(options, position);
        }
        this.insertButtonNextLine(options, ':refresh: Refresh', this.menuCallback(MenuCode.ViewDeactivatedPositions));
        this.insertButtonNextLine(options, ':back: Back', this.menuCallback(MenuCode.Main));
        return options;
    }

    private insertViewDeactivatedPositionButton(options : CallbackButton[][], position : Position) {
        this.insertButtonNextLine(options, `:deactivated: ${asTokenPrice(position.tokenAmt)} of $${position.token.symbol}`, new CallbackData(MenuCode.ViewDeactivatedPosition, position.positionID));
    }
}