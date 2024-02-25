import { CallbackButton, WalletData } from "./common";
import { Menu, MenuCapabilities } from "./menu";

export class MenuViewWallet extends Menu<WalletData> implements MenuCapabilities {
    renderText(): string {
        const line1 = `**Your Wallet Financials**`;
        const line2 = `*USDC Purchasing Power*: ${this.miscData!!.purchasingPowerUSDC.toString()}`;
        const line3 = `*SOL Purchasing Power*: ${this.miscData!!.purchasingPowerSOL.toString()}`;
        const line4 = `*USDC Value*: ${this.miscData!!.usdcValue.toString()}`;
        const line5 = `*SOL Value*: ${this.miscData!!.solValue.toString()}`;
        return [line1,line2,line3,line4,line5].join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertReturnToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'MarkdownV2';
    }
    forceResponse(): boolean {
        return true;
    }
    
}