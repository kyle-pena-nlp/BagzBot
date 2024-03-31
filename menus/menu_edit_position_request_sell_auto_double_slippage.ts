import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuEditPositionRequestSellAutoDoubleSlippage extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        const lines = ['Choose whether you would like to automatically double the slippage percent every time the auto-sell fails due to slippage tolerance being exceeded.'];
        lines.push('If you do not choose to auto-double and the price drops very rapidly, you may not get out quickly');
        lines.push('But if you choose to auto-double, you may lose out on profits if the token recovers or does not drop as rapidly.');
        lines.push('Use your best judgment.')
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, 'Yes - Auto-Double', new CallbackData(MenuCode.SubmitPosRequestAutoDoubleSlippageOptions, true.toString()));
        this.insertButtonNextLine(options, 'No - Do Not Auto-Double', new CallbackData(MenuCode.SubmitPosRequestAutoDoubleSlippageOptions, false.toString()));
        this.insertButtonNextLine(options, 'Back', new CallbackData(MenuCode.TrailingStopLossRequestReturnToEditorMenu));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        throw new Error("Method not implemented.");
    }
    renderURLPreviewNormally(): boolean {
        throw new Error("Method not implemented.");
    }
}