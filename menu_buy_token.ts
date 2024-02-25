import { CallbackButton, CallbackData, MenuCode } from "./common";
import { Menu, MenuCapabilities } from "./menu";

export class MenuOpenPosition extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        const tokenName = this.userData.session["tokenName"];
        return `Buy ${tokenName}`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();

        const buyWithAutoSellCallback = new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantityKeypad);
        this.insertButton(options, "Buy With Auto-Sell", buyWithAutoSellCallback, 1);

        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        throw new Error("Method not implemented.");
    }
    forceResponse(): boolean {
        throw new Error("Method not implemented.");
    }
    
}