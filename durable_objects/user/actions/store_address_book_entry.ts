import { CompletedAddressBookEntry } from "../model/address_book_entry";

export interface StoreAddressBookEntryRequest {
    addressBookEntry : CompletedAddressBookEntry
}

export interface SuccessfulStoreAddressBookEntryResponse {
    success : true
}

export interface FailedStoreAddressBookEntryResponse {
    success : false
    friendlyMessage : string
}

export type StoreAddressBookEntryResponse = SuccessfulStoreAddressBookEntryResponse | FailedStoreAddressBookEntryResponse;