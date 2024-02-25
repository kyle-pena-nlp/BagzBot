import { Menu, MenuCapabilities } from "./menu";
import { MenuCode, CallbackButton, MenuSpec, MenuDisplayMode } from "./common";

export class MenuWallet extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return ``; // TODO: balance
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButton(options, "Transfer Funds", this.menuCallback(MenuCode.TransferFunds), 1);
        this.insertButton(options, "Refresh",        this.menuCallback(MenuCode.RefreshWallet), 2);
        this.insertButton(options, "Export Wallet",  this.menuCallback(MenuCode.ExportWallet),  3);
        this.insertReturnToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'MarkdownV2';
    }    
    forceResponse() : boolean {
        return true;
    }
}