import { BaseUserDORequest } from "./base_user_action";

export interface RemoveAddressBookEntryRequest  extends BaseUserDORequest {
    addressBookEntryID : string
}

export interface RemoveAddressBookEntryResponse {
    
}