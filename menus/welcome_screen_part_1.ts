import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class WelcomeScreenPart1 extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return 'Welcome screen content part 1';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Next", new CallbackData(MenuCode.WelcomeScreenPart2));
        return options;
    }
}