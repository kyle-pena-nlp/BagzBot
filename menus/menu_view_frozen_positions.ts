import { asTokenPrice } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewFrozenPositions extends Menu<Position[]>  implements MenuCapabilities {
    renderText(): string {
        const lines = [`<b><u>Frozen Positions</u></b>
These positions have been frozen and will not automatically sell.`];
        if (this.menuData.length == 0) {
            lines.push("");
            lines.push("You have 0 frozen positions.");
        }
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        for (const position of this.menuData) {
            this.insertViewFrozenPositionButton(options, position);
        }
        this.insertButtonNextLine(options, ':back: Back', this.menuCallback(MenuCode.Main));
        return options;
    }

    private insertViewFrozenPositionButton(options : CallbackButton[][], position : Position) {
        this.insertButtonNextLine(options, `:ice: ${asTokenPrice(position.tokenAmt)} of $${position.token.symbol}`, new CallbackData(MenuCode.ViewFrozenPosition, position.positionID));
    }
}