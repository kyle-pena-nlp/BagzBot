import { SellResult } from "../durable_objects/user/user_sell";
import { CallbackButton } from "../telegram";
import { assertNever } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuRetryManualSell extends Menu<{ status: Exclude<SellResult, 'confirmed'|'unconfirmed'>, positionID : string }> implements MenuCapabilities {
    renderText(): string {
        switch(this.menuData.status) {
            case 'tx-failed':
            case 'failed':
                return `Closing the position encountered an issue due to network congestion.  Would you like to retry?`;
            case 'slippage-failed':
                return `Closing the position failed due to slippage.  Would you like to retry with the same slippage?`;
            default:
                assertNever(this.menuData.status);
        }
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Yes", new CallbackData(MenuCode.ClosePositionManuallyAction, this.menuData.positionID));
        this.insertButtonNextLine(options, "No", new CallbackData(MenuCode.ViewOpenPosition, this.menuData.positionID));
        return options;
    }
}