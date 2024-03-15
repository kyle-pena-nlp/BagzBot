import { QuantityAndToken } from "../durable_objects/user/model/quantity_and_token";
import { CallbackButton } from "../telegram/callback_button";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTrailingStopLossEntryBuyQuantity extends Menu<QuantityAndToken> implements MenuCapabilities {
    renderText(): string {
        return `${this.menuData.quantity} ${this.menuData.thisToken}`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "1%", new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantitySubmit, "1"));
        this.insertButtonNextLine(options, "5%", new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantitySubmit, "5"));
        this.insertButtonNextLine(options, "10%", new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantitySubmit, "10"));
        this.insertButtonNextLine(options, "Custom Percent", new CallbackData(MenuCode.TrailingStopLossEnterBuyQuantityKeypad, this.menuData.quantity.toString()));
        this.insertButtonNextLine(options, "Back", new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}