import { CompletedAddressBookEntry } from "../model/address_book_entry";
import { BaseUserAction } from "./base_user_action";

export interface ListAddressBookEntriesRequest  extends BaseUserAction {
}

export interface ListAddressBookEntriesResponse {
    addressBookEntries : CompletedAddressBookEntry[]
}