import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTrailingStopLossTriggerPercent extends Menu<number> implements MenuCapabilities {
    renderText(): string {
        return "Pick the percentage below the latest peak price that the position should be automatically sold.";
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const submitCode = MenuCode.SubmitTriggerPct;
        const defaultCustomTriggerPercent = this.menuData;
        this.insertButtonNextLine(options, "1%", new CallbackData(submitCode,  "1"));
        this.insertButtonSameLine(options, "5%", new CallbackData(submitCode,  "5"));
        this.insertButtonSameLine(options, "10%", new CallbackData(submitCode, "10"));
        this.insertButtonSameLine(options, "X%", new CallbackData(MenuCode.CustomTriggerPct, defaultCustomTriggerPercent.toString()));
        this.insertButtonNextLine(options, "Back", new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return "HTML";
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
    
}