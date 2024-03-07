import { CallbackButton, Menu, MenuCapabilities, MenuCode } from "./menu";
import { WalletData } from "../common";

export class MenuWallet extends Menu<WalletData> implements MenuCapabilities {
    renderText(): string {
        return `<b>SOL Purchasing Power</b>: ${this.miscData!!.purchasingPowerSOL}
        <b>USDC Purchasing Power</b>: ${this.miscData!!.purchasingPowerUSDC}
        <b>Current Value In SOL</b>: ${this.miscData!!.solValue}
        <b>Current Value In USDC</b>: ${this.miscData!!.usdcValue}`; // TODO: balance
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