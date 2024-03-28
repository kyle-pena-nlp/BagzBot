export interface BaseUserDORequest {
    telegramUserID :  number
    chatID :  number
}

export function isBaseUserDORequest(x : any) : x is BaseUserDORequest {
    return ('telegramUserID' in x) && ('chatID' in x);
}