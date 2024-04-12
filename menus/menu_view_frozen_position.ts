import { asTokenPrice } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewFrozenPosition extends Menu<Position> implements MenuCapabilities {
    renderText(): string {
        return `:ice: <b><u>This position is FROZEN.</u></b>
<b>${asTokenPrice(this.menuData.tokenAmt)}</b> of $${this.menuData.token.symbol}

Frozen Positions are not price monitored.

<b>Positions can be frozen for the following reasons</b>:
:bullet: The token gets rugged.
:bullet: There is insufficient SOL in your account to pay the transaction fees for the sale.
:bullet: There is not enough of this token in your wallet to cover the sale of this position.  This can happen if you swapped the tokens out of your wallet without using this bot.
:bullet: The sale failed for some other reason many times in a row.
:bullet: You chose to freeze the position

If you'd like to unfreeze the position and return the position to price monitoring, click 'Unfreeze Position'.


Support Code: <i><code>${this.menuData.positionID}</code></i>`
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        //this.insertButtonNextLine(options, 'Attempt Sale', new CallbackData(MenuCode.CloseFrozenPositionManually, this.menuData.positionID));
        this.insertButtonNextLine(options, "Unfreeze Position", new CallbackData(MenuCode.UnfreezePosition,this.menuData.positionID));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(MenuCode.ViewFrozenPositions));
        return options;
    }
}