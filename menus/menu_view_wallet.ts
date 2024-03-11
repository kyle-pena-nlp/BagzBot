import { GetWalletDataResponse } from "../durable_objects/user/actions/get_wallet_data";
import { CallbackButton, Menu, MenuCapabilities } from "./menu";

export class MenuViewWallet extends Menu<GetWalletDataResponse> implements MenuCapabilities {
    renderText(): string {
        /*const line1 = `<b>Your Wallet Financials</b>`;
        const line2 = `<i>USDC Purchasing Power</i>: ${this.miscData!!.purchasingPowerUSDC.toString()}`;
        const line3 = `<i>SOL Purchasing Power</i>: ${this.miscData!!.purchasingPowerSOL.toString()}`;
        const line4 = `<i>USDC Value</i>: ${this.miscData!!.usdcValue.toString()}`;
        const line5 = `<i>SOL Value</i>: ${this.miscData!!.solValue.toString()}`;
        return [line1,line2,line3,line4,line5].join("\r\n");*/
        return `Address: ${this.miscData!!.address}`
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertReturnToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
    
}