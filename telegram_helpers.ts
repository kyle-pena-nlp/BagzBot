import  { Env } from "./common";
import { makeJSONRequest, makeJSONResponse } from "./http_helpers";

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

export function makeTelegramBotUrl(methodName : string, env : Env) {
    return `${env.TELEGRAM_BOT_SERVER_URL}/bot${env.TELEGRAM_BOT_TOKEN}/${methodName}`;
}

export function escapeTGText(text : string, parseMode : 'MarkdownV2'|'HTML') : string {
    if (parseMode == 'MarkdownV2') {
        // TODO: replace with regex
        const pattern = /\[|]|\(|\)|~|`|>|#|\+|-|=|\||{|}|\.|!/g;
        text = text.replace(pattern, function (substring) {
            return '\\' + substring;
        })
    }
    return text;
}

export function makeTelegramSendMessageRequest(chatID : number, text : string, env : Env, parseMode? : 'MarkdownV2'|'HTML') : Request {
    const url = makeTelegramBotUrl('sendMessage', env);
    parseMode = parseMode||'HTML'
    const sendMessageBody = {
        "chat_id": chatID,
        "text": escapeTGText(text, parseMode),
        "parse_mode": parseMode
    };
    const request = makeJSONRequest(url, sendMessageBody);
    return request;
}

export async function sendMessageToTG(chatID : number, text : string, env : Env) {
    const request = makeTelegramSendMessageRequest(chatID, text, env);
    return await fetch(request);
}

export async function deleteTGMessage(messageID : number, env : Env) : Promise<DeleteTGMessageResponse> {
    const deleteMessageBody : any = { message_id: messageID };
    const request = makeJSONRequest(makeTelegramBotUrl("deleteMessage", env), deleteMessageBody);
    const result : DeleteTGMessageResponse = await fetch(request).then((response) => {
        return {
            success : true
        };
    }).catch(() => {
        return {
            success : false
        }
    });
    return result;
}


