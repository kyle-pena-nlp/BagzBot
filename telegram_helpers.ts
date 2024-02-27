import  { Env } from "./common";
import { makeJSONRequest } from "./http_helpers";

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



