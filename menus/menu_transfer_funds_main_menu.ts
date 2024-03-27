import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTransferFundsMainMenu extends Menu<undefined> implements MenuCapabilities {
    renderText(): string {
        return '';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, 'Add To Address Book', new CallbackData(MenuCode.AddFundsRecipientAddress));
        this.insertButtonNextLine(options, 'Choose A Recipient', new CallbackData(MenuCode.PickTransferFundsRecipient));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }

}