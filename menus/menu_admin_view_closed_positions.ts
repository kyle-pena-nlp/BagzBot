import { asTokenPrice } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { MenuCapabilities, PaginatedMenu } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuAdminViewClosedPositions extends PaginatedMenu<Position, { items: Position[], pageIndex : number }> implements MenuCapabilities {
    renderText(): string {
        const positions = this.menuData.items;
        return [
            `${positions.length} closed positions`
        ].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const paginatedPositions = this.getItemsOnPage();
        for (const position of paginatedPositions) {
            const closedPositionDescription = `${asTokenPrice(position.tokenAmt)} of ${position.token.symbol}`;
            this.insertButtonNextLine(options, closedPositionDescription, new CallbackData(MenuCode.AdminViewClosedPosition, position.positionID));
        }
        this.insertPaginationButtons(options, MenuCode.AdminViewClosedPositions);
        this.insertButtonNextLine(options, ':back: Back', this.menuCallback(MenuCode.Main));
        return options;
    }
}