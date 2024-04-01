import { QuantityAndToken } from "../durable_objects/user/model/quantity_and_token";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTrailingStopLossEntryBuyQuantity extends Menu<QuantityAndToken> implements MenuCapabilities {
    renderText(): string {
        return `Choose ${this.menuData.thisTokenSymbol} quantity`;
    }
    renderOptions(): CallbackButton[][] {
        const symbol = this.menuData.thisTokenSymbol;
        const options = this.emptyMenu();
        // todo: refer to configured buy limit
        this.insertButtonNextLine(options, `0.1 ${symbol}`, new CallbackData(MenuCode.SubmitBuyQuantity, "0.1"));
        this.insertButtonSameLine(options, `1 ${symbol}`, new CallbackData(MenuCode.SubmitBuyQuantity, "1"));
        this.insertButtonSameLine(options, `5 ${symbol}`, new CallbackData(MenuCode.SubmitBuyQuantity, "5"));
        this.insertButtonSameLine(options, `X ${symbol}`, new CallbackData(MenuCode.CustomBuyQuantity, this.menuData.quantity.toString()));
        this.insertButtonNextLine(options, "Back", new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
}