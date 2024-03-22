import { MapWithStorage } from "../../../util";
import { CompletedAddressBookEntry } from "../model/address_book_entry";

export class AddressBookEntryTracker extends MapWithStorage<CompletedAddressBookEntry> {
    constructor() {
        super('addressBookEntry');
    }
    getByName(name : string) : CompletedAddressBookEntry|undefined {
        for (const value of this.values()) {
            if (value.name === name) {
                return value;
            }
        }
        return undefined;
    }
    getByAddress(address : string) : CompletedAddressBookEntry|undefined {
        for (const value of this.values()) {
            if (value.address === address) {
                return value;
            }
        }
        return undefined;
    }
}