import { Menu, MenuCapabilities } from "./menu";
import { MenuCode, CallbackButton, MenuSpec } from "./common";

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
        return 'MarkdownV2';
    } 
    forceResponse() : boolean {
        return true;
    }   
}

export const HELP_STRING = `# Bagz Bot How-To Guide
## Create A Bagz Bot Wallet
## Send Funds To Your Bagz Bot Wallet 
## Open A Position
## Close A Position Early
## Withdrawal Funds
## Take Private Ownership of Wallet
## Invite Friends
`;