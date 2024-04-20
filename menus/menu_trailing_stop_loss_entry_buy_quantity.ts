import { QuantityAndToken } from "../durable_objects/user/model/quantity_and_token";
import { getCommonEnvironmentVariables } from "../env";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTrailingStopLossEntryBuyQuantity extends Menu<{ quantityAndToken: QuantityAndToken }> implements MenuCapabilities {
    renderText(): string {
        return `Choose ${this.menuData.quantityAndToken.thisTokenSymbol} quantity`;
    }
    renderOptions(): CallbackButton[][] {
        const symbol = this.menuData.quantityAndToken.thisTokenSymbol;
        const options = this.emptyMenu();
        
        let amounts = [];

        if (getCommonEnvironmentVariables(this.env).isBeta) {
            amounts = [0.01,0.1,0.25,0.5];
        }
        else {
            amounts = [0.1,1,5];
        }

        for (const amount of amounts) {
            this.insertButtonSameLine(options, `${amount} ${symbol}`, new CallbackData(MenuCode.SubmitBuyQuantity, amount.toString()));
        }

        this.insertButtonSameLine(options, `X ${symbol}`, new CallbackData(MenuCode.CustomBuyQuantity, this.menuData.quantityAndToken.quantity.toString()));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(MenuCode.ReturnToPositionRequestEditor));
        return options;
    }
}