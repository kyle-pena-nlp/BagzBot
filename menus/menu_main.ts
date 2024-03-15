import { UserData } from "../durable_objects/user/model/user_data";
import { CallbackButton } from "../telegram/callback_button";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuMain extends Menu<UserData> implements MenuCapabilities {
    renderText(): string {
        return `Welcome ${this.menuData.telegramUserName || 'new user'}!`;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const hasWallet = this.menuData.hasWallet;
        if (hasWallet) {
            this.insertButtonNextLine(options, 'Wallet', this.menuCallback(MenuCode.Wallet));
            this.insertButtonNextLine(options, 'Positions', this.menuCallback(MenuCode.ListPositions));
            this.createOptionsFAQHelpMenuLine(options);
        }
        else {
            this.insertButtonNextLine(options, 'Create Your Personal Wallet', this.menuCallback(MenuCode.CreateWallet));
            this.createOptionsFAQHelpMenuLine(options);
        }
        this.insertCloseButtonNextLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }    
    forceResponse() : boolean {
        return true;
    }
}