import { dAdd, toFriendlyString } from "../decimalized";
import { asPercentDeltaString, asTokenPrice } from "../decimalized/decimalized_amount";
import { UserData } from "../durable_objects/user/model/user_data";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { logoHack } from "./logo_hack";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface Stuff {
    isAdminOrSuperAdmin : boolean
    isImpersonatingUser: boolean
    impersonatedUserID : number|undefined
    botName : string
    botTagline : string
    isBeta : boolean
    isDev : boolean,
    isInviteCodeGated : boolean
}

export class MenuMain extends Menu<UserData & Stuff> implements MenuCapabilities {
    renderText(): string {
        const lines = [
            `${logoHack()}<b>${this.menuData.botName} Main Menu</b>`,
            `<i>${this.menuData.botTagline}</i>`
        ];

        if (!this.menuData.hasWallet) {
            lines.push("<blockquote>We are creating your wallet! Refresh in a few seconds to see the full menu.</blockquote>")
        }        

        if (this.menuData.isBeta) {
            lines.push("");
            lines.push(`<blockquote>${this.menuData.botName} is in BETA - USE AT YOUR OWN RISK!`);
            lines.push(`Maintenance window will be from 12:00 AM to 2:00 AM EST.</blockquote>`);
            lines.push("");
        }
        
        if (this.menuData.maybeSOLBalance != null) {
            lines.push(
                `:wallet: <b>Wallet</b>: <code>${this.menuData.address}</code>`,
                `<b>Wallet SOL Balance</b>: ${toFriendlyString(this.menuData.maybeSOLBalance, 4)} SOL`,
            );
        }
        else {
            lines.push(`<b>Main Menu</b>`);
        }

        if (this.menuData.maybePNL != null) {
            lines.push(
                `<b>Total Unrealized PNL</b>: ${asTokenPrice(this.menuData.maybePNL.currentTotalValue)} SOL (${asPercentDeltaString(this.menuData.maybePNL.PNLpercent)})`
            );
        }

        if (this.menuData.maybePNL != null && this.menuData.maybeSOLBalance != null) {
            const totalWalletValue = dAdd(this.menuData.maybeSOLBalance, this.menuData.maybePNL.currentTotalValue);
            lines.push(`<b>Total Value:</b> ${asTokenPrice(totalWalletValue)} SOL`)
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
            this.insertButtonNextLine(options, ':sparkle: Auto-Sell :sparkle:', this.menuCallback(MenuCode.NewPosition));
            if (this.menuData.isBeta) {
                this.insertButtonSameLine(options, ':chart_down: Auto-Buy :chart_down:', new CallbackData(MenuCode.ComingSoon, "Automatically buy the dip!"));
                this.insertButtonSameLine(options, ':wave: Wave Rider :wave:', new CallbackData(MenuCode.ComingSoon, "Combines Auto-Buy and Auto-Sell!"));
            }
            this.insertButtonNextLine(options, ':briefcase: Wallet', this.menuCallback(MenuCode.Wallet));
            this.insertButtonSameLine(options, ':chart_up: Positions', this.menuCallback(MenuCode.ListPositions));
            this.insertButtonNextLine(options, ':ledger: PNL History', this.menuCallback(MenuCode.ViewPNLHistory));
            if (this.menuData.hasInviteBetaCodes) {
                this.insertButtonNextLine(options, ":envelope: Invite Friends To Beta", this.menuCallback(MenuCode.BetaGateInviteFriends));
            }
            if (this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'ADMIN: End User Support', this.menuCallback(MenuCode.UnimpersonateUser));
            }
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: Invoke Alarm', this.menuCallback(MenuCode.AdminInvokeAlarm));
            }
            if (this.menuData.isAdminOrSuperAdmin && !this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'ADMIN: Begin User Support', this.menuCallback(MenuCode.ImpersonateUser));
            }
            if (this.menuData.isAdminOrSuperAdmin && this.menuData.isDev) {
                this.insertButtonNextLine(options, 'ADMIN (Dev Only): Set Price', this.menuCallback(MenuCode.AdminDevSetPrice));
            }
            if (this.menuData.isAdminOrSuperAdmin && (this.menuData.isDev || this.menuData.isBeta)) {
                this.insertButtonNextLine(options, 'ADMIN: Delete all positions', this.menuCallback(MenuCode.AdminDeleteAllPositions))
            }     
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: Send User Message', this.menuCallback(MenuCode.AdminSendUserMessage));
            }       
            if (this.menuData.isBeta) {
                this.insertButtonNextLine(options, ':love_letter: Send Feedback :love_letter:', this.menuCallback(MenuCode.BetaFeedbackQuestion));
            }
            
            this.insertButtonNextLine(options, ":help: FAQ", this.menuCallback(MenuCode.FAQ));
        }
        this.insertButtonNextLine(options, ":refresh: Refresh", this.menuCallback(MenuCode.Main));
        this.insertCloseButtonNextLine(options);
        return options;
    }

    renderURLPreviewNormally(): boolean {
        return false;
    }
}