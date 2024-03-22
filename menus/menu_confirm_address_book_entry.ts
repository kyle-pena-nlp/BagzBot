import { CompletedAddressBookEntry } from "../durable_objects/user/model/address_book_entry";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuConfirmAddressBookEntry extends Menu<CompletedAddressBookEntry> implements MenuCapabilities {
    renderText(): string {
        return `What would you like to do?`
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, "Perform a test transfer (0.0001 SOL)", new CallbackData(MenuCode.AddressBookEntryPerformTestTransfer)),
        this.insertButtonNextLine(options, "Add to Address Book", new CallbackData(MenuCode.SubmitAddressBookEntry));
        this.insertButtonNextLine(options, "Cancel", new CallbackData(MenuCode.TransferFunds));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        return 'HTML';
    }
    forceResponse(): boolean {
        return true;
    }

}