import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface ViewWalletData {

};

export class MenuWallet extends Menu<ViewWalletData> implements MenuCapabilities {
    renderText(): string {
        return `<b>Your Wallet.</b>`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButton(options, "Transfer Funds", this.menuCallback(MenuCode.TransferFunds), 1);
        this.insertButton(options, "Get Private Key",  this.menuCallback(MenuCode.ViewDecryptedWallet),  3);
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }    
    forceResponse() : boolean {
        return true;
    }
}