import { BaseUserAction } from "./base_user_action";

export interface RemoveAddressBookEntryRequest  extends BaseUserAction {
    addressBookEntryID : string
}

export interface RemoveAddressBookEntryResponse {
    
}