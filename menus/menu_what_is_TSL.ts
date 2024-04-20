import { CallbackButton } from "../telegram";
import { logoHack } from "./logo_hack";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuWhatIsTSL extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return `${logoHack()}<b><u>What is a TSL?</u></b>

A <b>Trailing Stop Loss</b> (TSL) is an advanced trade type used by fiat traders.

<u>${this.env.TELEGRAM_BOT_DISPLAY_NAME} is the first bot to offer this trade for Solana, or for any blockchain.</u>

A TSL position keep track of the "Peak Price" - the highest price since you opened the trade.

As soon as the position backs 5% off the Peak, the position is automatically sold (you can customize 5% to any percentage you like).

This helps you <u>lock in gains</u> but also <u>limit losses</u>.`
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu()
        this.insertButtonNextLine(options, ':back: Back', this.menuCallback(MenuCode.Main));
        return options;
    }  
    renderURLPreviewNormally(): boolean {
        return false;
    }  
}