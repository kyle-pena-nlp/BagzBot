import { CallbackData } from "./callback_data";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";
import { TokenInfo } from "./token_tracker";

export class MenuOpenPosition extends Menu<TokenInfo> implements MenuCapabilities {
    renderText(): string {
        const tokenName = this.miscData!!.token;
        return `Buy <b>${tokenName}</b>`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();

        const buyWithAutoSellCallback = new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantityKeypad, this.miscData!!.tokenAddress);
        this.insertButton(options, "Buy With Auto-Sell", buyWithAutoSellCallback, 1);

        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
    
}