import { asTokenPrice } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuAdminViewClosedPositions extends Menu<Position[]> implements MenuCapabilities {
    renderText(): string {
        return `${this.menuData.length} closed positions`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        for (const position of this.menuData) {
            const closedPositionDescription = `${asTokenPrice(position.tokenAmt)} of ${position.token.symbol}`;
            this.insertButtonNextLine(options, closedPositionDescription, new CallbackData(MenuCode.AdminViewClosedPosition, position.positionID));
        }
        return options;
    }
    
}