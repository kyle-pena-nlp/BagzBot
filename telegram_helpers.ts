import  { Env } from "./common";

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



