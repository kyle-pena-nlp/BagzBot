import { CallbackButton } from "../telegram";
import { TokenInfo } from "../tokens";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuOpenPosition extends Menu<TokenInfo> implements MenuCapabilities {
    renderText(): string {
        const tokenSymbol = this.menuData.symbol;
        return `Buy <b>${tokenSymbol}</b>`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();

        const buyWithAutoSellCallback = new CallbackData(MenuCode.CustomBuyQuantity, this.menuData.address);
        this.insertButton(options, "Buy With Auto-Sell", buyWithAutoSellCallback, 1);

        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
    
}