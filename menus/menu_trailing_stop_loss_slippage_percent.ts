import { CallbackData } from "./callback_data";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";

export class MenuTrailingStopLossSlippagePercent extends Menu<number> implements MenuCapabilities {
    renderText(): string {
        return `Pick a Slippage Percent tolerance. The same percentage will apply on the automatic sell.`
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const defaultCustomSlippagePercentage = this.menuData;
        const submitValueCode = MenuCode.TrailingStopLossCustomSlippagePctKeypadSubmit;
        this.insertButton(options, "0.5%", new CallbackData(submitValueCode, "0.5"), 1);
        this.insertButton(options, "1.0%", new CallbackData(submitValueCode, "1.0"), 1);
        this.insertButton(options, "2.0%", new CallbackData(submitValueCode, "2.0"), 1);
        this.insertButton(options, "5.0%", new CallbackData(submitValueCode, "5.0"), 1);
        this.insertButtonNextLine(options, "Custom", new CallbackData(MenuCode.TrailingStopLossCustomSlippagePctKeypad, defaultCustomSlippagePercentage.toString()))
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return "HTML";
    }
    forceResponse(): boolean {
        return true;
    }
    
}