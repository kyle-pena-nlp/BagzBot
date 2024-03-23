import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";

export class MenuBetaInviteFriends extends Menu<string[]> implements MenuCapabilities {
    renderText(): string {
        const inviteBetaCodes = this.menuData;
        const lines : string[] = [
            'Send these Beta Invite Codes to your friends.',
            `When your friends claim them, they will be removed from the list.`,
            `You have ${inviteBetaCodes.length} invite codes remaining!`
        ];
        lines.push(...inviteBetaCodes.map(code => `<code>${code}</code>`));
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }

}