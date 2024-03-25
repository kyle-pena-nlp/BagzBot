import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class WelcomeScreenPart2 extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return 'Welcome screen content part 2';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Get Started!", new CallbackData(MenuCode.Main));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }

}