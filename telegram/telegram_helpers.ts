import { Env } from "../env";
import { makeFakeFailedRequestResponse, makeJSONRequest, makeSuccessResponse } from "../http";
import { logError } from "../logging";
import { MenuCode } from "../menus";
import { CallbackData } from "../menus/callback_data";
import { sleep } from "../util";
import { CallbackButton } from "./callback_button";
import { subInEmojis } from "./emojis";

export interface DeleteTGMessageResponse {
    success: boolean
}

// https://core.telegram.org/bots/api#messageentity
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

export interface SuccessfulTgMessageSentInfo {
    success: true
    chatID : number
    messageID : number
}

export interface FailedTgMessageSentInfo {
    success : false
}

export type TgMessageSentInfo = FailedTgMessageSentInfo | SuccessfulTgMessageSentInfo

export function isSuccessfulTgMessage(x : TgMessageSentInfo) : x is SuccessfulTgMessageSentInfo {
    return x.success;
}

export function makeTelegramBotUrl(methodName : string, env : Env) {
    return `${env.TELEGRAM_BOT_SERVER_URL}/bot${env.SECRET__TELEGRAM_BOT_TOKEN}/${methodName}`;
}

export function escapeTGText(text : string, parseMode : 'MarkdownV2'|'HTML') : string {
    if (parseMode == 'MarkdownV2') {
        const pattern = /\[|]|\(|\)|~|`|>|#|\+|-|=|\||{|}|\.|!/g;
        text = text.replace(pattern, function (substring) {
            return '\\' + substring;
        });
    }
    return text;
}

export async function sendQuestionToTG(chatID : number,
    question: string,
    context : FetchEvent,
    env: Env,
    parseMode : 'HTML'|'MarkdownV2' = 'HTML',
    timeout_ms ?: number) : Promise<TgMessageSentInfo> {
    const request = makeTelegramSendQuestionRequest(chatID, question, env, parseMode);
    return await transformToTGMessageSentInfo(fetch(request)).then(async result => {
        if (result.success) {
            if (timeout_ms != null && timeout_ms > 0) {
                // deliberate lack of 'await' here.
                context.waitUntil(sleep(timeout_ms).then(async () => {
                    await deleteTGMessage(result.messageID, chatID, env);
                }));
            }
        }
        return result;
    });
}

function makeTelegramSendQuestionRequest(chatID : number, question : string, env : Env, parseMode : 'HTML'|'MarkdownV2') {
    const method = 'sendMessage';
    const url = makeTelegramBotUrl(method, env);
    const body : any = { 
        chat_id: chatID,
        text: question,
        parse_mode: parseMode,
        reply_markup: {
            force_reply: true,
            input_field_placeholder: "Enter your response here..."
        }           
    };        
    const request = makeJSONRequest(url, body);
    return request;
}

async function transformToTGMessageSentInfo(response : Promise<Response>) : Promise<TgMessageSentInfo> {
    return response.then(async (response) => {
        if (response.ok) {
            const responseJSON : any = await response.json();
            const success : SuccessfulTgMessageSentInfo = {
                success: true,
                chatID : responseJSON.result.chat.id as number,
                messageID: responseJSON.result.message_id as number
            };
            return success;
        }
        else {
            const responseDescription = (await response.json().catch(r => null));
            logError("Failed to send TG message: ", responseDescription);
            const failure : FailedTgMessageSentInfo = { success: false };
            return failure;
        }
    }).catch(() => {
        const failure : FailedTgMessageSentInfo = { success: false };
        return failure;
    });
}

export async function updateTGMessage(chatID : number, 
    messageID : number, 
    text : string, 
    env : Env,
    parseMode : 'HTML'|'MarkdownV2' = 'HTML', 
    dismissButton : boolean|MenuCode = false,
    menuArg : string|null = null) : Promise<TgMessageSentInfo> {
    text = subInEmojis(text);
    const request = makeTelegramUpdateMessageRequest(chatID, messageID, text, env, parseMode, dismissButton, menuArg);
    return await transformToTGMessageSentInfo(fetch(request));
}

export async function sendMessageToTG(chatID : number, 
    text : string, 
    env : Env,
    parseMode : 'HTML'|'MarkdownV2' = 'HTML', 
    dismissButton : boolean|MenuCode = false,
    menuArg : string|null = null) : Promise<TgMessageSentInfo> {
    text = subInEmojis(text);
    const request = makeTelegramSendMessageRequest(chatID, text, env, parseMode, dismissButton, menuArg);
    return await transformToTGMessageSentInfo(fetch(request));
}

export async function deleteTGMessage(messageID : number, chatID : number, env : Env) : Promise<DeleteTGMessageResponse> {
    const deleteMessageBody : any = { message_id: messageID, chat_id: chatID };
    const request = makeJSONRequest(makeTelegramBotUrl("deleteMessage", env), deleteMessageBody);
    return await fetch(request).then(async (response) => {
        if (!response.ok) {
            const description = await tryGetTGDescription(response);
            return { success: false };
        }
        else {
            return { success: true };
        }
    }).catch((response) => {
        return { success : false };
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
    });
}

function makeTelegramSendMessageRequest(chatID : number, 
    text : string, 
    env : Env, 
    parseMode : 'MarkdownV2'|'HTML',
    dismissButton : boolean|MenuCode,
    menuArg : string|null) : Request {
    const url = makeTelegramBotUrl('sendMessage', env);
    parseMode = parseMode||'HTML';
    let sendMessageBody : any = {
        "chat_id": chatID,
        "text": escapeTGText(text, parseMode),
        "parse_mode": parseMode
    };
    if (dismissButton) {
        sendMessageBody = addDismissButton(dismissButton, menuArg, sendMessageBody);
    }
    const request = makeJSONRequest(url, sendMessageBody);
    return request;
}

function makeTelegramUpdateMessageRequest(chatID : number, 
    messageID : number, 
    text : string, 
    env : Env, 
    parseMode : 'MarkdownV2'|'HTML',
    dismissButton : boolean|MenuCode,
    menuArg : string|null) : Request {
    const url = makeTelegramBotUrl('editMessageText', env);
    parseMode = parseMode||'HTML';
    let sendMessageBody : any = {
        "chat_id": chatID,
        "message_id": messageID,
        "text": escapeTGText(text, parseMode),
        "parse_mode": parseMode
    };
    if (dismissButton) {
        sendMessageBody = addDismissButton(dismissButton, menuArg, sendMessageBody);
    }
    const request = makeJSONRequest(url, sendMessageBody);
    return request;
}

function addDismissButton(dimissButton : true|MenuCode, menuArg : string|null, requestBody: any) {
    const menuCode = dimissButton === true ? MenuCode.Close : dimissButton;
    const dismissButton : CallbackButton = {
        text: "OK",
        callback_data: new CallbackData(menuCode,menuArg||undefined).toString()
    };
    const dismissButtonKeyboard : CallbackButton[][] = [[dismissButton]];
    return {
        ...requestBody,
        reply_markup: {
            "inline_keyboard": dismissButtonKeyboard
        }
    };
}


export async function tryGetTGDescription(response : Response) : Promise<string|undefined> {
    try {
        const responseBody : any = await response.json();
        return responseBody.description;
    }
    catch {
        return undefined;
    }
}

