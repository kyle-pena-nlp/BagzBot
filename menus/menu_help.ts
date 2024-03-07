import { CallbackButton, Menu, MenuCapabilities } from "./menu";

export class MenuHelp extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return HELP_STRING;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertReturnToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    } 
    forceResponse() : boolean {
        return true;
    }   
}

export const HELP_STRING = `<b>Bagz Bot How-To Guide</b>

<b>Create A Bagz Bot Wallet</b>

<b>Send Funds To Your Bagz Bot Wallet </b>

<b>Open A Position</b>

<b>Close A Position Early</b>

<b>Withdrawal Funds</b>

<b>Take Private Ownership of Wallet</b>

<b>Invite Friends</b>

`;