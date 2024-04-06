import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { logoHack } from "./logo_hack";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class WelcomeScreenPart1 extends Menu<{ botDisplayName : string }> implements MenuCapabilities {
    renderText(): string {
        return `${logoHack()}<b>Thank you for trying ${this.menuData.botDisplayName}.  
If I could have just a moment of your time.</b>

${this.menuData.botDisplayName} implements a unique feature called a <b>'Trailing Stop Loss'</b>.

<b>This is how it works</b>:
:bullet: When you open a new position, ${this.menuData.botDisplayName} will <u>Track The Peak</u>.
:bullet: <u>The Peak</u> is the highest value ever attained by your position since you opened it.
:bullet: If the value of your position dips more than 5% below the peak, the position is automatically sold.
:bullet: That way, you can lock in most of your gains.
Of course, you can set "5%" to any other percent you like.

<u>We Have Huge Plans</u>:
:bullet: Upgrading our RPC to a dedicated node for lightning fast trades.
:bullet: Offering more sophisticated rules for auto-selling and buying back in.
:bullet: The ability to specify automatic aggressive priority fees to make sure you get out quick.
        `;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, ":sparkle: Get Started! :sparkle:", new CallbackData(MenuCode.Main));
        return options;
    }

    renderURLPreviewNormally(): boolean {
        return false;
    }
}