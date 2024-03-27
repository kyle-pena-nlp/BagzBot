import { CompletedAddressBookEntry } from "../durable_objects/user/model/address_book_entry";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuPickTransferFundsRecipient extends Menu<CompletedAddressBookEntry[]> implements MenuCapabilities {
    renderText(): string {
        return 'Choose a recipient';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        for (const addressBookEntry of this.menuData) {
            const buttonText = `${addressBookEntry.name} (${addressBookEntry.address.slice(0,4)}...)`;
            this.insertButtonNextLine(options, buttonText, new CallbackData(MenuCode.TransferFundsRecipientSubmitted, addressBookEntry.address));
        }
        this.insertButtonNextLine(options, "Back", new CallbackData(MenuCode.TransferFunds));
        return options;
    }
    parseMode(): "MarkdownV2" | "HTML" {
        throw new Error("Method not implemented.");
    }
    renderURLPreviewNormally(): boolean {
        throw new Error("Method not implemented.");
    }

}