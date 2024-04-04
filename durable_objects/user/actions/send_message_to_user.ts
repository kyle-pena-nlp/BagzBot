
export interface SendMessageToUserRequest {
    message : string
    fromTelegramUserID : number
    toTelegramUserID : number
    fromTelegramUserName : string
}

export function isSendMessageToUserRequest(x : any) : x is SendMessageToUserRequest {
    return 'toTelegramUserID' in x; 
}

export interface SendMessageToUserResponse {

}