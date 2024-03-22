import { Structural } from "../../../util"

export interface JustAddressBookEntryID {
    readonly [ key : string ] : Structural
    addressBookEntryID : string
};

export interface JustAddressBookEntryName {
    readonly [ key : string ] : Structural
    addressBookEntryID : string
    name : string
};

export interface CompletedAddressBookEntry {
    readonly [ key : string ] : Structural
    addressBookEntryID : string
    name : string
    address : string
    confirmed : boolean
};

export type AddressBookEntry = JustAddressBookEntryID | JustAddressBookEntryName | CompletedAddressBookEntry;