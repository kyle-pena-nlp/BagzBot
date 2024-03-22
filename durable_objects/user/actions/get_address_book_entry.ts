import { CompletedAddressBookEntry } from "../model/address_book_entry"

export interface GetAddressBookEntryRequest {
    addressBookEntryID : string
}

export interface GetAddressBookEntryResponse {
    addressBookEntry: CompletedAddressBookEntry|undefined
}