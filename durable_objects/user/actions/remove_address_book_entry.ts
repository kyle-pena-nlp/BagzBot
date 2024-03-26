import { BaseUserDORequest } from "./base_user_do_request";

export interface RemoveAddressBookEntryRequest  extends BaseUserDORequest {
    addressBookEntryID : string
}

export interface RemoveAddressBookEntryResponse {
    
}