import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuContinueMessage extends Menu<string> implements MenuCapabilities {
    continueMenuCode: MenuCode;
    messageParseMode : 'HTML'|'MarkdownV2';
    constructor(message : string, continueMenuCode : MenuCode, messageParseMode : 'HTML'|'MarkdownV2' = 'HTML') {
        super(message);
        this.continueMenuCode = continueMenuCode;
        this.messageParseMode = messageParseMode;
    }
    renderText(): string {
        return this.menuData;
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Continue", new CallbackData(this.continueMenuCode));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return this.messageParseMode;
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
    
}