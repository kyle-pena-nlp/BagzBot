import { CallbackButton } from "../telegram";
import { addAutoDoubleSlippageVerbiage } from "./auto_double_slippage_verbiage";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuEditPositionRequestSellAutoDoubleSlippage extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        const lines : string[] = [];
        addAutoDoubleSlippageVerbiage(lines);
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, 'Yes - Auto-Double Slippage', new CallbackData(MenuCode.SubmitPosRequestAutoDoubleSlippageOptions, true.toString()));
        this.insertButtonNextLine(options, 'No - Do Not Auto-Double Slippage', new CallbackData(MenuCode.SubmitPosRequestAutoDoubleSlippageOptions, false.toString()));
        this.insertButtonNextLine(options, 'Back', new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
}