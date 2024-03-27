import { toFriendlyString } from "../decimalized";
import { UserData } from "../durable_objects/user/model/user_data";
import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface ViewWalletData {
    address : string
};

export class MenuWallet extends Menu<UserData> implements MenuCapabilities {
    renderText(): string {
        const lines : string[] = [];
        if (this.menuData.address != null) {
            lines.push(`Address: <code>${this.menuData.address||''}</code>`);
        }
        if (this.menuData.maybeSOLBalance != null) {
            lines.push(`Balance: ${toFriendlyString(this.menuData.maybeSOLBalance, 4)} SOL`);
        }
        if (this.menuData.address != null) {
            lines.push(`<a href='https://solscan.io/account/${this.menuData.address}'>View Wallet</a>`);
        }
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButton(options, "Transfer Funds", this.menuCallback(MenuCode.TransferFunds), 1);
        this.insertButton(options, "View Private Key",  this.menuCallback(MenuCode.ViewDecryptedWallet),  3);
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }    
    renderURLPreviewNormally() : boolean {
        return true;
    }
}