import { CallbackData } from "./callback_data";
import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";

export class MenuTrailingStopLossTriggerPercent extends Menu<number> implements MenuCapabilities {
    renderText(): string {
        return "Pick the percentage below the latest peak price that the position should be automatically sold."
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const submitCode = MenuCode.TrailingStopLossCustomTriggerPercentKeypadSubmit;
        const defaultCustomTriggerPercent = this.menuData;
        this.insertButton(options, "1%", new CallbackData(submitCode,  "1"), 1);
        this.insertButton(options, "5%", new CallbackData(submitCode,  "5"), 1);
        this.insertButton(options, "10%", new CallbackData(submitCode, "10"), 1);
        this.insertButtonNextLine(options, "Custom", new CallbackData(MenuCode.TrailingStopLossCustomTriggerPercentKeypad, defaultCustomTriggerPercent.toString()));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return "HTML";
    }
    forceResponse(): boolean {
        return true;
    }
    
}