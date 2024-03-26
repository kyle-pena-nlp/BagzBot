import { CompletedAddressBookEntry } from "../model/address_book_entry";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetAddressBookEntryRequest  extends BaseUserDORequest {
    addressBookEntryID : string
}

export interface GetAddressBookEntryResponse {
    addressBookEntry: CompletedAddressBookEntry|undefined
}