import { CallbackData } from "./callback_data";
import { QuantityAndToken } from "../common";
import { Menu, MenuCapabilities, CallbackButton, MenuCode } from "./menu";

export class MenuTrailingStopLossEntryBuyQuantity extends Menu<QuantityAndToken> implements MenuCapabilities {
    renderText(): string {
        return `${this.miscData!!.quantity} ${this.miscData!!.thisToken}`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "1%", new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantitySubmit, "1"));
        this.insertButtonNextLine(options, "5%", new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantitySubmit, "5"));
        this.insertButtonNextLine(options, "10%", new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantitySubmit, "10"));
        this.insertButtonNextLine(options, "Custom Percent", new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantityKeypad, this.miscData!!.quantity.toString()));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}