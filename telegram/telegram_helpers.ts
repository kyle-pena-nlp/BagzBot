import { Env } from "../env";
import { MenuCode } from "../menus";
import { CallbackData } from "../menus/callback_data";
import { makeFakeFailedRequestResponse, makeJSONRequest, makeSuccessResponse } from "../util";
import { CallbackButton } from "./callback_button";

export interface DeleteTGMessageResponse {
    success: boolean
}

// https://core.telegram.org/bots/api#messageentity
/*
Currently, can be “mention” (@username), 
“hashtag” (#hashtag), 
“cashtag” ($USD), 
“bot_command” (/start@jobs_bot), 
“url” (https://telegram.org), 
“email” (do-not-reply@telegram.org), 
“phone_number” (+1-212-555-0123), 
“bold” (bold text), 
“italic” (italic text), 
“underline” (underlined text), 
“strikethrough” (strikethrough text), 
“spoiler” (spoiler message), 
“blockquote” (block quotation), 
“code” (monowidth string), 
“pre” (monowidth block), 
“text_link” (for clickable text URLs), 
“text_mention” (for users without usernames), 
“custom_emoji” (for inline custom emoji stickers)
*/
export interface TGTextEntity {
    type : TGTextEntityType
    text : string
}

export enum TGTextEntityType {
    text,
    hashtag,
    cashtag,
    bot_command,
    url,
    text_mention,
    other
}

export interface TgMessageSentInfo {
    success: boolean
    chatID? : number
    messageID? : number
}

export function makeTelegramBotUrl(methodName : string, env : Env) {
    return `${env.TELEGRAM_BOT_SERVER_URL}/bot${env.TELEGRAM_BOT_TOKEN}/${methodName}`;
}

export function escapeTGText(text : string, parseMode : 'MarkdownV2'|'HTML') : string {
    if (parseMode == 'MarkdownV2') {
        const pattern = /\[|]|\(|\)|~|`|>|#|\+|-|=|\||{|}|\.|!/g;
        text = text.replace(pattern, function (substring) {
            return '\\' + substring;
        })
    }
    return text;
}





export async function updateTGMessage(chatID : number, 
    messageID : number, 
    text : string, 
    env : Env,
    parseMode : 'HTML'|'MarkdownV2' = 'HTML', 
    includeDismissButton : boolean = false) : Promise<TgMessageSentInfo> {
    const request = makeTelegramUpdateMessageRequest(chatID, messageID, text, env, parseMode, includeDismissButton);
    return await fetch(request).then(async (response) => {
        if (response.ok) {
            const responseJSON : any = await response.json();
            return {
                success: true,
                chatID : responseJSON.result?.chat.id,
                messageID: responseJSON.result?.message_id
            };
        }
        else {
            return { success: false };
        }
    }).catch(() => {
        return { success: false};
    });
}

export async function sendMessageToTG(chatID : number, 
    text : string, 
    env : Env,
    parseMode : 'HTML'|'MarkdownV2' = 'HTML', 
    includeDismissButton : boolean = false) : Promise<TgMessageSentInfo> {
    
    const request = makeTelegramSendMessageRequest(chatID, text, env, parseMode, includeDismissButton);
    return await fetch(request).then(async (response) => {
        if (response.ok) {
            const responseJSON : any = await response.json();
            return {
                success: true,
                chatID : responseJSON.result?.chat.id,
                messageID: responseJSON.result?.message_id
            };
        }
        else {
            return { success: false };
        }
    }).catch(() => {
        return { success: false};
    });
}

export async function deleteTGMessage(messageID : number, chatID : number, env : Env) : Promise<DeleteTGMessageResponse> {
    const deleteMessageBody : any = { message_id: messageID, chat_id: chatID };
    const request = makeJSONRequest(makeTelegramBotUrl("deleteMessage", env), deleteMessageBody);
    return await fetch(request).then(async (response) => {
        if (!response.ok) {
            const description = await tryGetTGDescription(response);
            return { success: false }
        }
        else {
            return { success: true }
        }
    }).catch((response) => {
        return { success : false }
    });
}

export async function sendRequestToTG(request : Request) : Promise<Response> {
    return await fetch(request!!).then(async (response) => {
        if (!response.ok) {
            const tgDescription = await tryGetTGDescription(response);
            return makeFakeFailedRequestResponse(500, response.statusText, tgDescription);
        }
        else {
            return makeSuccessResponse();
        }
    })
}

function makeTelegramSendMessageRequest(chatID : number, 
    text : string, 
    env : Env, 
    parseMode : 'MarkdownV2'|'HTML',
    includeDismissButton : boolean) : Request {
    const url = makeTelegramBotUrl('sendMessage', env);
    parseMode = parseMode||'HTML'
    let sendMessageBody : any = {
        "chat_id": chatID,
        "text": escapeTGText(text, parseMode),
        "parse_mode": parseMode
    };
    if (includeDismissButton) {
        sendMessageBody = addDismissButton(sendMessageBody);
    }
    const request = makeJSONRequest(url, sendMessageBody);
    return request;
}

function makeTelegramUpdateMessageRequest(chatID : number, 
    messageID : number, 
    text : string, 
    env : Env, 
    parseMode : 'MarkdownV2'|'HTML',
    includeDismissButton : boolean) : Request {
    const url = makeTelegramBotUrl('editMessageText', env);
    parseMode = parseMode||'HTML'
    let sendMessageBody : any = {
        "chat_id": chatID,
        "message_id": messageID,
        "text": escapeTGText(text, parseMode),
        "parse_mode": parseMode
    };
    if (includeDismissButton) {
        sendMessageBody = addDismissButton(sendMessageBody);
    }
    const request = makeJSONRequest(url, sendMessageBody);
    return request;
}

function addDismissButton(requestBody: any) {
    const dismissButton : CallbackButton = {
        text: "Dismiss",
        callback_data: new CallbackData(MenuCode.Close).toString()
    };
    const dismissButtonKeyboard : CallbackButton[][] = [[dismissButton]];
    return {
        ...requestBody,
        reply_markup: {
            "inline_keyboard": dismissButtonKeyboard
        }
    }
}


async function tryGetTGDescription(response : Response) : Promise<string|undefined> {
    try {
        const responseBody : any = await response.json();
        return responseBody.description;
    }
    catch {
        return undefined;
    }
}

