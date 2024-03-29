import { dAdd, toFriendlyString } from "../decimalized";
import { toNumber } from "../decimalized/decimalized_amount";
import { UserData } from "../durable_objects/user/model/user_data";
import { CallbackButton } from "../telegram";
import { interpretPct, interpretSOLAmount } from "../telegram/emojis";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface Stuff {
    isAdminOrSuperAdmin : boolean
    isImpersonatingUser: boolean
    impersonatedUserID : number|undefined
    botName : string
    botTagline : string
    isBeta : boolean
    isDev : boolean
}

export class MenuMain extends Menu<UserData & Stuff> implements MenuCapabilities {
    renderText(): string {
        const lines = [];
        
        if (this.menuData.maybeSOLBalance != null) {
            const unspentSOLEmoji = interpretSOLAmount(toNumber(this.menuData.maybeSOLBalance));
            lines.push(
                `<b>:bot: ${this.menuData.botName} Main Menu</b>`,
                `<i>${this.menuData.botTagline}</i>`,
                `:wallet: <b>Wallet</b>: <code>${this.menuData.address}</code>`,
                `<b>Unspent SOL Balance</b>: ${toFriendlyString(this.menuData.maybeSOLBalance, 4)} SOL ${unspentSOLEmoji}`,
            );
        }
        else {
            lines.push(`<b>Main Menu</b>`);
        }

        if (this.menuData.maybePNL != null) {
            const pnlEmoji = interpretPct(toNumber(this.menuData.maybePNL.PNLpercent));
            lines.push(
                `<b>Total Value Of Open Positions</b>: ${toFriendlyString(this.menuData.maybePNL.currentTotalValue, 4)} SOL (${toFriendlyString(this.menuData.maybePNL.PNLpercent,4, { useSubscripts: false,  addCommas: false, includePlusSign: true, maxDecimalPlaces: 2 })}%) ${pnlEmoji}`
            );
        }

        if (this.menuData.maybePNL != null && this.menuData.maybeSOLBalance != null) {
            const totalWalletValue = dAdd(this.menuData.maybeSOLBalance, this.menuData.maybePNL.currentTotalValue);
            const walletValueEmoji = interpretSOLAmount(toNumber(totalWalletValue));
            lines.push(`<b>Total Value of Wallet:</b> ${toFriendlyString(totalWalletValue,4, { useSubscripts: false, addCommas: true, maxDecimalPlaces: 4 })} SOL ${walletValueEmoji}`)
        }

        if (this.menuData.isImpersonatingUser) {
            lines.push(`Currently IMPERSONATING '${this.menuData.impersonatedUserID||''}'`)
        }
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const hasWallet = this.menuData.hasWallet;
        if (hasWallet) {
            this.insertButtonNextLine(options, ':sparkle: New Position :sparkle:', this.menuCallback(MenuCode.NewPosition));
            this.insertButtonNextLine(options, ':briefcase: Wallet', this.menuCallback(MenuCode.Wallet));
            this.insertButtonSameLine(options, ':chart_up: Positions', this.menuCallback(MenuCode.ListPositions));
            if (this.menuData.hasInviteBetaCodes) {
                this.insertButtonNextLine(options, ":envelope: Invite Friends To Beta", this.menuCallback(MenuCode.BetaGateInviteFriends));
            }
            if (this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'ADMIN: End User Support', this.menuCallback(MenuCode.UnimpersonateUser));
            }
            if (this.menuData.isAdminOrSuperAdmin && !this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'ADMIN: Begin User Support', this.menuCallback(MenuCode.ImpersonateUser));
            }
            if (this.menuData.isBeta) {
                this.insertButtonNextLine(options, ':love_letter: Send Feedback :love_letter:', this.menuCallback(MenuCode.BetaFeedbackQuestion));
            }
            if (this.menuData.isAdminOrSuperAdmin && this.menuData.isDev) {
                this.insertButtonNextLine(options, 'ADMIN (Dev Only): Set Price', this.menuCallback(MenuCode.AdminDevSetPrice));
            }            
            this.createHelpMenuLine(options);
        }
        this.insertCloseButtonNextLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }    
    renderURLPreviewNormally() : boolean {
        return true;
    }
}