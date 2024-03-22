import { CompletedAddressBookEntry } from "../model/address_book_entry";

export interface ListAddressBookEntriesRequest {
}

export interface ListAddressBookEntriesResponse {
    addressBookEntries : CompletedAddressBookEntry[]
}