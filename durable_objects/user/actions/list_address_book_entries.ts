import { CompletedAddressBookEntry } from "../model/address_book_entry";
import { BaseUserDORequest } from "./base_user_action";

export interface ListAddressBookEntriesRequest  extends BaseUserDORequest {
}

export interface ListAddressBookEntriesResponse {
    addressBookEntries : CompletedAddressBookEntry[]
}