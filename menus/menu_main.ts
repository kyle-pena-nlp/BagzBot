import { toFriendlyString } from "../decimalized";
import { UserData } from "../durable_objects/user/model/user_data";
import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface AdminStatus {
    isAdminOrSuperAdmin : boolean
    isImpersonatingUser: boolean
}

export class MenuMain extends Menu<UserData & AdminStatus> implements MenuCapabilities {
    renderText(): string {
        if (this.menuData.maybeSOLBalance != null) {
            return [
                `<b>Main Menu</b> | ${toFriendlyString(this.menuData.maybeSOLBalance, 4)} SOL in wallet.`,
                `<code>${this.menuData.address}</code>`
            ].join('\r\n');
        }
        else {
            return `<b>Main Menu</b>`;
        }
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const hasWallet = this.menuData.hasWallet;
        if (hasWallet) {
            this.insertButtonNextLine(options, 'New Position', this.menuCallback(MenuCode.NewPosition));
            this.insertButtonNextLine(options, 'Wallet', this.menuCallback(MenuCode.Wallet));
            this.insertButtonSameLine(options, 'Positions', this.menuCallback(MenuCode.ListPositions));
            if (this.menuData.hasInviteBetaCodes) {
                this.insertButtonNextLine(options, "Invite Friends To Beta", this.menuCallback(MenuCode.BetaGateInviteFriends));
            }
            if (this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'Impersonate', this.menuCallback(MenuCode.ImpersonateUser));
            }
            if (this.menuData.isAdminOrSuperAdmin && !this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'Unimpersonate', this.menuCallback(MenuCode.UnimpersonateUser));
            }
            this.createHelpMenuLine(options);
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