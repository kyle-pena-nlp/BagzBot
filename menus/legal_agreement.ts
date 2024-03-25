import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class LegalAgreement extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return 'Legal Stuff Here';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Agree", new CallbackData(MenuCode.LegalAgreementAgree));
        this.insertButtonNextLine(options, "Agree", new CallbackData(MenuCode.LegalAgreementRefuse));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }
}