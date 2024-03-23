import { CallbackData } from "../../menus/callback_data"

export interface CallbackHandlerData {
    telegramUserID : number
    telegramUserName : string
    chatID : number
    messageID : number
    callbackData : CallbackData
}