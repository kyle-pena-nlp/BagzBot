import { CallbackData } from "./callback_data";
import { TokenNameAndAddress } from "../common";
import { Menu, MenuCapabilities, CallbackButton, MenuCode } from "./menu";
import { VsToken } from "../tokens/vs_tokens";

export class MenuTrailingStopLossPickVsToken extends Menu<TokenNameAndAddress> implements MenuCapabilities {
    renderText(): string {
        return 'Choose which token to buy your position with.'
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, VsToken.SOL.toString(),  new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenuSubmit, VsToken.SOL.toString()));
        this.insertButtonNextLine(options, VsToken.USDC.toString(), new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenuSubmit, VsToken.USDC.toString()));
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}