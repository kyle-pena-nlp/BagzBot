import { DurableObjectStorage } from "@cloudflare/workers-types";
import { CompletedAddressBookEntry } from "../model/address_book_entry";

export class AddressBookEntryTracker {
    items : Map<string,CompletedAddressBookEntry> = new Map<string,CompletedAddressBookEntry>();
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    initialize(entries : Map<string,any>) {
        for (const [storageKey,entry] of entries) {
            if (!AddressBookEntryStorageKey.matches(storageKey)) {
                continue;
            }
            this.items.set(storageKey, entry);
        }
    }
    storeAddressBookEntries(entries : CompletedAddressBookEntry[]) {
        for (const entry of entries) {
            const storageKey = new AddressBookEntryStorageKey(entry.addressBookEntryID);
            this.items.set(storageKey.toString(), entry);
            this.markAsDirty(storageKey);
        }
    }
    getById(id : string) : CompletedAddressBookEntry|undefined {
        const storageKey = new AddressBookEntryStorageKey(id);
        return this.items.get(storageKey.toString());
    }
    getByName(name : string) : CompletedAddressBookEntry|undefined {
        for (const [key,entry] of this.items) {
            if (entry.name === name) {
                return entry;
            }
        }
        return undefined;
    }
    getByAddress(address : string) : CompletedAddressBookEntry|undefined {
        for (const [key,entry] of this.items) {
            if (entry.address === address) {
                return entry;
            }
        }
    }
    removeById(id : string) {
        const storageKey = new AddressBookEntryStorageKey(id);
        this.items.delete(storageKey.toString());
        this.markForDeletion(storageKey);
    }
    markAsDirty(storageKey : AddressBookEntryStorageKey) {
        this.deletedKeys.delete(storageKey.toString());
        this.dirtyTracking.add(storageKey.toString());
    }
    markForDeletion(storageKey : AddressBookEntryStorageKey) {
        this.dirtyTracking.delete(storageKey.toString());
        this.deletedKeys.add(storageKey.toString());
    }
    listAddressBookEntries() : CompletedAddressBookEntry[] {
        return [...this.items.values()];
    }
    async flushToStorage(storage : DurableObjectStorage) {
        const putEntries : Record<string,CompletedAddressBookEntry> = {};
        for (const storageKey of this.dirtyTracking) {
            const entry = this.items.get(storageKey);
            if (entry != null) {
                putEntries[storageKey] = entry;
            }
        }

        const putPromise = storage.put(putEntries).then(() => {
            this.dirtyTracking.clear();
        });

        const deletePromise = storage.delete([...this.dirtyTracking]).then(() => {
            this.deletedKeys.clear();
        });

        return Promise.all([putPromise,deletePromise]);
    }
}

class AddressBookEntryStorageKey {
    static matcher : RegExp = new RegExp("^addressBookEntry:");
    id : string
    constructor(id : string) {
        this.id = id;
    }
    toString() {
        return `addressBookEntry:${this.id}`;
    }
    static parse(storageKey : string) : AddressBookEntryStorageKey {
        const idx = storageKey.indexOf(":");
        const id = storageKey.slice(idx+1);
        return new AddressBookEntryStorageKey(id);
    }
    static matches(storageKey : string) {
        return storageKey.match(AddressBookEntryStorageKey.matcher);
    }
}