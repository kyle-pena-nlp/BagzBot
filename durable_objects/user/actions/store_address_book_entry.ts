import { CompletedAddressBookEntry } from "../model/address_book_entry";
import { BaseUserDORequest } from "./base_user_do_request";

export interface StoreAddressBookEntryRequest  extends BaseUserDORequest {
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