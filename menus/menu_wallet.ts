import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";
import { GetWalletDataResponse } from "../durable_objects/user/actions/get_wallet_data";

export class MenuWallet extends Menu<GetWalletDataResponse> implements MenuCapabilities {
    renderText(): string {
        return `Address: ${this.menuData.address}`; // TODO: balance
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
        return 'HTML';
    }    
    forceResponse() : boolean {
        return true;
    }
}