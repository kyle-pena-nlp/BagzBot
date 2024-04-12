import { asTokenPrice } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewDeactivatedPosition extends Menu<Position> implements MenuCapabilities {
    renderText(): string {
        return `:deactivated: <b><u>This position is DEACTIVATED.</u></b>
<b>${asTokenPrice(this.menuData.tokenAmt)}</b> of $${this.menuData.token.symbol}

Deactivated Positions are not price monitored and will not be automatically sold.

<b>Positions can be deactivated for the following reasons</b>:
:bullet: The token gets rugged.
:bullet: There is insufficient SOL in your account to pay the transaction fees for the sale.
:bullet: There is not enough of this token in your wallet to cover the sale of this position.  This can happen if you swapped the tokens out of your wallet without using this bot.
:bullet: The sale failed for some other reason many times in a row.
:bullet: You chose to manually deactivate the position

If you'd like to activate the position and return the position to price monitoring, click 'Reactivate Position'.


Support Code: <i><code>${this.menuData.positionID}</code></i>`
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        //this.insertButtonNextLine(options, 'Attempt Sale', new CallbackData(MenuCode.CloseDeactivatedPositionManually, this.menuData.positionID));
        this.insertButtonNextLine(options, "Reactivate Position", new CallbackData(MenuCode.ReactivatePosition,this.menuData.positionID));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(MenuCode.ViewDeactivatedPositions));
        return options;
    }
}