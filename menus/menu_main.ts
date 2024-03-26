import { toFriendlyString } from "../decimalized";
import { UserData } from "../durable_objects/user/model/user_data";
import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface AdminStatus {
    isAdminOrSuperAdmin : boolean
    isImpersonatingUser: boolean
    impersonatedUserID : number|undefined
}

export class MenuMain extends Menu<UserData & AdminStatus> implements MenuCapabilities {
    renderText(): string {
        const lines = [];
        if (this.menuData.maybeSOLBalance != null) {
            lines.push(
                `<b>Main Menu</b> | ${toFriendlyString(this.menuData.maybeSOLBalance, 4)} SOL in wallet.`,
                `<code>${this.menuData.address}</code>`
            );
        }
        else {
            lines.push(`<b>Main Menu</b>`);
        }
        if (this.menuData.isImpersonatingUser) {
            lines.push(`Current IMPERSONATING '${this.menuData.impersonatedUserID||''}'`)
        }
        return lines.join("\r\n");
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
                this.insertButtonNextLine(options, 'ADMIN: Unimpersonate', this.menuCallback(MenuCode.UnimpersonateUser));
            }
            if (this.menuData.isAdminOrSuperAdmin && !this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'ADMIN: Impersonate a User', this.menuCallback(MenuCode.ImpersonateUser));
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