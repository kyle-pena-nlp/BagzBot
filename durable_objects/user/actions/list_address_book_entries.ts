import { CompletedAddressBookEntry } from "../model/address_book_entry";
import { BaseUserDORequest } from "./base_user_do_request";

export interface ListAddressBookEntriesRequest  extends BaseUserDORequest {
}

export interface ListAddressBookEntriesResponse {
    addressBookEntries : CompletedAddressBookEntry[]
}