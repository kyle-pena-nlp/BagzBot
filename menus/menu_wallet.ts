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
        lines.push(":wallet: <b>Your Wallet</b>");
        if (this.menuData.address != null) {
            lines.push(`<b>Address</b>: <code>${this.menuData.address||''}</code>`);
        }
        if (this.menuData.maybeSOLBalance != null) {
            lines.push(`<b>Balance</b>: ${toFriendlyString(this.menuData.maybeSOLBalance, 4)} SOL`);
        }
        if (this.menuData.address != null) {
            lines.push(`<a href='https://solscan.io/account/${this.menuData.address}'>View Wallet</a>`);
        }
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButton(options, ":dollars: Transfer Funds :dollars:", this.menuCallback(MenuCode.TransferFunds), 1);
        this.insertButton(options, ":key: View Private Key :key:",  this.menuCallback(MenuCode.ViewDecryptedWallet),  3);
        this.insertButtonNextLine(options, ":refresh: Refresh", this.menuCallback(MenuCode.Wallet));
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
}