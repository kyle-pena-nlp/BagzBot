import { dAdd, toFriendlyString } from "../decimalized";
import { asTokenPrice } from "../decimalized/decimalized_amount";
import { UserData } from "../durable_objects/user/model/user_data";
import { getCommonEnvironmentVariables } from "../env";
import { CallbackButton } from "../telegram";
import { logoHack } from "./logo_hack";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export interface AdminInfo {
    isAdminOrSuperAdmin : boolean
    isImpersonatingUser: boolean
    impersonatedUserID : number|undefined
}

export class MenuMain extends Menu<UserData & AdminInfo> implements MenuCapabilities {
    renderText(): string {
        const envVars = getCommonEnvironmentVariables(this.env);
        const lines = [
            `${logoHack()}<b>${envVars.botName} Main Menu</b>`,
            `<i>${envVars.botTagline}</i>`
        ];

        if (!this.menuData.hasWallet) {
            lines.push("<blockquote>We are creating your wallet! Refresh in a few seconds to see the full menu.</blockquote>")
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
                `<b>Total Value of Open Positions</b>: 14.23 SOL (+13.1%)`
            );
        }

        if (this.menuData.maybePNL != null && this.menuData.maybeSOLBalance != null) {
            const totalWalletValue = dAdd(this.menuData.maybeSOLBalance, this.menuData.maybePNL.currentTotalValue);
            lines.push(`<b>Total Value:</b> ${asTokenPrice(totalWalletValue)} SOL`)
        }

        lines.push("");
        lines.push(":ticket: <b>Referral Based Discounts Are Active!</b> :ticket:")
        lines.push('<b>3</b> of your referrals were active <b>this week</b>');
        //lines.push('<b>Referral-Based Discount</b>: <code>3</code>*<code>0.1%</code> = <code>0.3%</code>');
        lines.push('<code>Base Fee:           </code> <code>0.75%</code>')
        lines.push('<code>Fee Reduction:      </code> <code>0.30%</code> = <code>3</code> referrals * <code>0.10%</code>');
        lines.push('<code>Your Discounted Fee:</code> <code>0.45%</code>');

        if (this.menuData.isImpersonatingUser) {
            lines.push(`Currently IMPERSONATING '${this.menuData.impersonatedUserID||''}'`)
        }
        
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const envVars = getCommonEnvironmentVariables(this.env);
        const options = this.emptyMenu();
        const hasWallet = this.menuData.hasWallet;
        if (hasWallet) {
            this.insertButtonNextLine(options, ':sparkle: Auto-Buy Position', this.menuCallback(MenuCode.AutoBuyMainMenu));
            this.insertButtonSameLine(options, ':chart_up: Auto-Sell Position', this.menuCallback(MenuCode.TSLMainMenu));
            this.insertButtonNextLine(options, ':sparkle: Auto-Buy + Auto-Sell :chart_up:', this.menuCallback(MenuCode.AutoBuyAutoSellMain));
            this.insertButtonNextLine(options, ':dollars: Regular Position', this.menuCallback(MenuCode.RegPosMainMenu));

            /*if (this.menuData.isBeta) {
                this.insertButtonSameLine(options, ':chart_down: Auto-Buy :chart_down:', new CallbackData(MenuCode.ComingSoon, "Automatically buy the dip!"));
                this.insertButtonSameLine(options, ':wave: Wave Rider :wave:', new CallbackData(MenuCode.ComingSoon, "Combines Auto-Buy and TSL.!"));
            }*/

            this.insertButtonNextLine(options, ':briefcase: Wallet', this.menuCallback(MenuCode.Wallet));
            this.insertButtonSameLine(options, ':ledger: PnL', this.menuCallback(MenuCode.ViewPNLHistory));
            this.insertButtonSameLine(options, ':ticket: Referrals', this.menuCallback(MenuCode.Referrals));

            this.insertButtonNextLine(options, ':deactivated: Deactivated', this.menuCallback(MenuCode.ViewDeactivatedPositions));
            this.insertButtonSameLine(options, ':settings: Settings', this.menuCallback(MenuCode.Settings));
            this.insertButtonSameLine(options, ":help: Help", this.menuCallback(MenuCode.MenuWhatIsTSL));

            if (this.menuData.hasInviteBetaCodes) {
                this.insertButtonNextLine(options, ":envelope: Invite Friends To Beta", this.menuCallback(MenuCode.BetaGateInviteFriends));
            }
            if (this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'ADMIN: End User Support', this.menuCallback(MenuCode.UnimpersonateUser));
            }
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: View Object', this.menuCallback(MenuCode.AdminViewObject));
            }
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: Invoke Alarm', this.menuCallback(MenuCode.AdminInvokeAlarm));
            }
            if (this.menuData.isAdminOrSuperAdmin && !this.menuData.isImpersonatingUser) {
                this.insertButtonNextLine(options, 'ADMIN: Begin User Support', this.menuCallback(MenuCode.ImpersonateUser));
            }
            if (this.menuData.isAdminOrSuperAdmin && envVars.isDev) {
                this.insertButtonNextLine(options, 'ADMIN (Dev Only): Set Price', this.menuCallback(MenuCode.AdminDevSetPrice));
            }
            if (this.menuData.isAdminOrSuperAdmin && (envVars.isDev || envVars.isBeta)) {
                this.insertButtonNextLine(options, 'ADMIN: Delete all positions', this.menuCallback(MenuCode.AdminDeleteAllPositions));
            }   
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: Delete closed positions', this.menuCallback(MenuCode.AdminDeleteClosedPositions));
            }
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: Reset position request defaults', this.menuCallback(MenuCode.AdminResetPositionRequestDefaults));
            }
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: Send User Message', this.menuCallback(MenuCode.AdminSendUserMessage));
            }   
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: Count Positions', this.menuCallback(MenuCode.AdminCountPositions));
            }
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: View Closed Positions', this.menuCallback(MenuCode.AdminViewClosedPositions));
            }
            if (this.menuData.isAdminOrSuperAdmin) {
                this.insertButtonNextLine(options, 'ADMIN: Delete Position By ID', this.menuCallback(MenuCode.AdminDeletePositionByID));
            }
            if (envVars.isBeta) {
                this.insertButtonNextLine(options, ':love_letter: Send Feedback :love_letter:', this.menuCallback(MenuCode.BetaFeedbackQuestion));
            }
            
            //this.insertButtonSameLine(options, ":help: FAQ", this.menuCallback(MenuCode.FAQ));
        }
        this.insertButtonNextLine(options, ":refresh: Refresh", this.menuCallback(MenuCode.Main));
        this.insertButtonSameLine(options, "Close", this.menuCallback(MenuCode.Close));
        return options;
    }

    renderURLPreviewNormally(): boolean {
        return false;
    }
}