import { CallbackButton } from "../telegram";
import { Menu, MenuCapabilities } from "./menu";

export class MenuBetaInviteFriends extends Menu<{ betaInviteCodes: string[], botUserName: string}> implements MenuCapabilities {
    renderText(): string {
        const inviteBetaCodes = this.menuData.betaInviteCodes;
        const botUsername = this.menuData.botUserName;
        const lines : string[] = [
            'Send these one-time-use links to your friends. Click or long-press to copy.',
        ];
        lines.push(...inviteBetaCodes.map(code => `:ticket: <code>https://t.me/${botUsername}?start=${code}</code>`));
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
}