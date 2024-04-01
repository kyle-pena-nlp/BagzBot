import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTrailingStopLossSlippagePercent extends Menu<number> implements MenuCapabilities {
    renderText(): string {
        return `Pick a Slippage Percent tolerance. The same percentage will apply on the automatic sell.`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const defaultCustomSlippagePercentage = this.menuData;
        const submitValueCode = MenuCode.SubmitSlippagePct;
        this.insertButtonNextLine(options, "0.5%", new CallbackData(submitValueCode, "0.5"));
        this.insertButtonSameLine(options, "1.0%", new CallbackData(submitValueCode, "1.0"));
        this.insertButtonSameLine(options, "2.0%", new CallbackData(submitValueCode, "2.0"));
        this.insertButtonSameLine(options, "X%", new CallbackData(MenuCode.CustomSlippagePct, defaultCustomSlippagePercentage.toString()));
        this.insertButtonNextLine(options, "Back", new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
}