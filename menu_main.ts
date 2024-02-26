import { Menu, MenuCapabilities } from "./menu";
import { MenuCode, CallbackButton, MenuSpec, MenuDisplayMode } from "./common";

export class MenuMain extends Menu<boolean> implements MenuCapabilities {
    renderText(): string {
        return `Welcome ${this.userData.telegramUserName || 'new user'}!`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const hasWallet = this.miscData!!;
        if (hasWallet) {
            this.insertButtonNextLine(options, 'Wallet', this.menuCallback(MenuCode.Wallet));
            this.insertButtonNextLine(options, 'Positions', this.menuCallback(MenuCode.ListPositions));
            this.createOptionsFAQHelpMenuLine(options);
        }
        else {
            this.insertButtonNextLine(options, 'Create Your Personal Wallet', this.menuCallback(MenuCode.CreateWallet));
            this.createOptionsFAQHelpMenuLine(options);
        }
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }    
    forceResponse() : boolean {
        return true;
    }
}