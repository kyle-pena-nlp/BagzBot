import { Menu, MenuCapabilities } from "./menu";
import { MenuCode, CallbackButton, MenuSpec, MenuDisplayMode } from "./common";

export class MenuMain extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return `Welcome ${this.userData.telegramUserName || 'new user'}!`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        if (this.userData.hasWallet) {
            this.insertButtonNextLine(options, 'Wallet', this.menuCallback(MenuCode.Wallet));
            this.insertButtonNextLine(options, 'Positions', this.menuCallback(MenuCode.ListPositions));
            this.createOptionsFAQHelpMenuLine(options);
        }
        else {
            this.insertButtonNextLine(options, 'Create Wallet', this.menuCallback(MenuCode.CreateWallet));
            this.createOptionsFAQHelpMenuLine(options);
        }
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'MarkdownV2';
    }    
    forceResponse() : boolean {
        return true;
    }
}