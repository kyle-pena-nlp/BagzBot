import { CompletedAddressBookEntry } from "../model/address_book_entry"
import { BaseUserAction } from "./base_user_action";

export interface GetAddressBookEntryRequest  extends BaseUserAction {
    addressBookEntryID : string
}

export interface GetAddressBookEntryResponse {
    addressBookEntry: CompletedAddressBookEntry|undefined
}