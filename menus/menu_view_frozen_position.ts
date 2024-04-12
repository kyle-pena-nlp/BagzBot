import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewFrozenPosition extends Menu<Position> implements MenuCapabilities {
    renderText(): string {
        return `:ice: This position has been FROZEN.
:bullet: The system freezes positions of rugged tokens
:bullet: The system also freezes positions that have failed to auto-sell many times
:bullet: You can also freeze a position if you don't want it to auto-sell
If you unfreeze the position, the system will begin tracking its price again.
However, the system may re-freeze if it detects the same conditions as before.

Support Code: <i>${this.menuData.positionID}</i>`
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Unfreeze Position", new CallbackData(MenuCode.UnfreezePosition,this.menuData.positionID));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(MenuCode.ViewFrozenPositions));
        return options;
    }
}