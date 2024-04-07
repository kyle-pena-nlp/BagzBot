import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { DecryptedWalletData } from "./decrypted_wallet_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";


export class MenuViewDecryptedWallet extends Menu<DecryptedWalletData> implements MenuCapabilities {
    renderText(): string {
        const lines = [
            `<b>Private Key:</b> <span class="tg-spoiler">${this.menuData.decryptedPrivateKey}</span>`,
            `<i>We do not store keys in plaintext.  This private key was decrypted and sent to you securely over telegram.</i>`
        ];
        return lines.join('\r\n');
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(MenuCode.Wallet));
        return options;
    }
}