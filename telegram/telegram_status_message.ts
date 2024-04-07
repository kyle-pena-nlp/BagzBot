import { TGStatusMessage } from ".";
import { Env } from "../env";
import { logError } from "../logging";
import { MenuCode } from "../menus";
import { pause } from "../util";
import { subInEmojis } from "./emojis";
import { deleteTGMessage, sendMessageToTG, updateTGMessage } from "./telegram_helpers";

export interface UpdateableMessage { 
    promiseChain: Promise<TGMessageChannel|{ chatID : number, env : Env, parseMode : 'HTML'|'MarkdownV2', prefix: string|null }> 
}

export class TGMessageChannel {
    messageID : number;
    chatID : number;
    message : string;
    prefix : string;
    parseMode : 'HTML'|'MarkdownV2';
    dismissable : boolean|MenuCode;
    menuArg : string|null
    lastSendSuccessful : boolean;
    env : Env;
    deleted : boolean = false;
    private constructor(message : string, 
        parseMode : 'HTML'|'MarkdownV2', 
        dismissable : boolean|MenuCode, 
        messageID : number, 
        chatID : number, 
        env : Env, 
        prefix : string|null,
        menuArg : string|null) {
        this.messageID = messageID;
        this.chatID = chatID;
        this.message = subInEmojis(message);        
        this.parseMode = parseMode;        
        this.dismissable = dismissable;
        this.lastSendSuccessful = true;
        this.env = env;
        this.prefix = prefix || '';
        this.menuArg = menuArg;
    }
    /* Create a status message that can be updated, in a non-blocking fashion, with minimum 500ms updates between updates */
    static createAndSend(message : string, 
        dismissable : boolean|MenuCode, 
        chatID : number, 
        env : Env, 
        parseMode : 'HTML'|'MarkdownV2' = 'HTML',
        prefix : string|null = null,
        menuArg : string|null = null) : UpdateableMessage {
        const promiseChain = sendMessageToTG(chatID, (prefix||'') + message, env, parseMode, dismissable, menuArg).then(sentMsgInfo => {
            if (!sentMsgInfo.success) {
                return { chatID: chatID, env : env, parseMode: parseMode, prefix: prefix, menuArg: menuArg };
            }
            const messageID = sentMsgInfo.messageID!!;
            return new TGMessageChannel(message, parseMode, dismissable, messageID, chatID, env, prefix, menuArg);
        });
        return {
            promiseChain: promiseChain
        };
    }
    static replaceWithNotification(
        messageID : number,
        message : string,
        dismissable : boolean,
        chatID : number,
        env : Env,
        parseMode : 'HTML'|'MarkdownV2' = 'HTML',
        prefix : string|null = null,
        menuArg : string|null = null) : UpdateableMessage {
            const statusMessage = new TGMessageChannel(message,parseMode,dismissable,messageID,chatID,env,prefix,menuArg);
            return {
                promiseChain: statusMessage.send()
            };
    }
    /* Append a status message to a queue of status messages, in a non-blocking fashion, with 500ms pauses between messages. */
    static async queue(statusMessage : UpdateableMessage, 
        message : string, 
        dismissable : boolean|MenuCode,
        menuArg : string|null = null) {
        statusMessage.promiseChain = statusMessage.promiseChain.then(m => {
            if ('messageID' in m) {
                return m.updateAndSend(message, dismissable, menuArg);
            }
            else {
                return TGMessageChannel.createAndSend(message, dismissable, m.chatID, m.env, m.parseMode, m.prefix, menuArg).promiseChain;
            }
        }).then(pause(500));
    }
    static async finalize(statusMessage : UpdateableMessage) {
        await statusMessage.promiseChain.catch(r => {
            logError(r);
        });
    }
    static async finalMessage(statusMessage : UpdateableMessage, finalMessage : string, dismissable : boolean|MenuCode, menuArg : string|null = null) {
        TGStatusMessage.queue(statusMessage, finalMessage, dismissable, menuArg);
        await TGStatusMessage.finalize(statusMessage);
    }
    static async queueWait(statusMessage : UpdateableMessage, waitMS : number) {
        statusMessage.promiseChain = statusMessage.promiseChain.then(pause(waitMS));
    }
    /* Remove a message in a non-blocking fashion. */
    static async queueRemoval(statusMessage : UpdateableMessage) {
        statusMessage.promiseChain = statusMessage.promiseChain.then(m => {
            if ('messageID' in m) {
                return m.remove();
            }
            else {
                return m;
            }
        });
    }
    private async updateAndSend(message : string, dismissable ?: boolean|MenuCode, menuArg : string|null = null) : Promise<TGMessageChannel> {
        if (dismissable != null) {
            this.dismissable = dismissable;
        }
        if (menuArg != null) {
            this.menuArg = menuArg;
        }
        this.message = message;
        await this.send();
        return this;
    }
    private async send() : Promise<TGMessageChannel> {
        const sentMsgInfo = await updateTGMessage(this.chatID, 
            this.messageID, 
            (this.prefix||'') + this.message, 
            this.env, 
            this.parseMode, 
            this.dismissable,
            this.menuArg);
        this.lastSendSuccessful = sentMsgInfo.success;
        return this;
    }
    private async remove() : Promise<TGMessageChannel> {
        const result = await deleteTGMessage(this.messageID, this.chatID, this.env);
        this.deleted = result.success;
        return this;
    }
}