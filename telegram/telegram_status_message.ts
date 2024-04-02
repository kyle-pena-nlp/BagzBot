import { Env } from "../env";
import { logError } from "../logging";
import { pause } from "../util";
import { subInEmojis } from "./emojis";
import { deleteTGMessage, sendMessageToTG, updateTGMessage } from "./telegram_helpers";

export interface UpdateableNotification { 
    promiseChain: Promise<TGStatusMessage|{ chatID : number, env : Env, parseMode : 'HTML'|'MarkdownV2', prefix: string|null }> 
}

export class TGStatusMessage {
    messageID : number;
    chatID : number;
    message : string;
    prefix : string;
    parseMode : 'HTML'|'MarkdownV2';
    dismissable : boolean;
    lastSendSuccessful : boolean;
    env : Env;
    deleted : boolean = false;
    private constructor(message : string, parseMode : 'HTML'|'MarkdownV2', dismissable : boolean, messageID : number, chatID : number, env : Env, prefix : string|null) {
        this.messageID = messageID;
        this.chatID = chatID;
        this.message = subInEmojis(message);        
        this.parseMode = parseMode;        
        this.dismissable = dismissable;
        this.lastSendSuccessful = true;
        this.env = env;
        this.prefix = prefix || '';
    }
    /* Create a status message that can be updated, in a non-blocking fashion, with minimum 500ms updates between updates */
    static createAndSend(message : string, 
        dismissable : boolean, 
        chatID : number, 
        env : Env, 
        parseMode : 'HTML'|'MarkdownV2' = 'HTML',
        prefix : string|null = null) : UpdateableNotification {
        const promiseChain = sendMessageToTG(chatID, (prefix||'') + message, env, parseMode, dismissable).then(sentMsgInfo => {
            if (!sentMsgInfo.success) {
                return { chatID: chatID, env : env, parseMode: parseMode, prefix: prefix };
            }
            const messageID = sentMsgInfo.messageID!!;
            return new TGStatusMessage(message, parseMode, dismissable, messageID, chatID, env, prefix);
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
        prefix : string|null = null) : UpdateableNotification {
            const statusMessage = new TGStatusMessage(message,parseMode,dismissable,messageID,chatID,env,prefix);
            return {
                promiseChain: statusMessage.send()
            };
    }
    /* Append a status message to a queue of status messages, in a non-blocking fashion, with 500ms pauses between messages. */
    static async queue(statusMessage : UpdateableNotification, 
        message : string, 
        dismissable : boolean) {
        statusMessage.promiseChain = statusMessage.promiseChain.then(m => {
            if ('messageID' in m) {
                return m.updateAndSend(message, dismissable);
            }
            else {
                return TGStatusMessage.createAndSend(message, dismissable, m.chatID, m.env, m.parseMode, m.prefix).promiseChain;
            }
        }).then(pause(500));
    }
    static async finalize(statusMessage : UpdateableNotification) {
        await statusMessage.promiseChain.catch(r => {
            logError(r);
        });
    }
    /* Remove a message in a non-blocking fashion. */
    static async remove(statusMessage : UpdateableNotification) {
        statusMessage.promiseChain = statusMessage.promiseChain.then(m => {
            if ('messageID' in m) {
                return m.remove();
            }
            else {
                return m;
            }
        });
    }
    private async updateAndSend(message : string, dismissable ?: boolean) : Promise<TGStatusMessage> {
        if (dismissable != null) {
            this.dismissable = dismissable;
        }
        this.message = message;
        await this.send();
        return this;
    }
    private async send() : Promise<TGStatusMessage> {
        const sentMsgInfo = await updateTGMessage(this.chatID, 
            this.messageID, 
            (this.prefix||'') + this.message, 
            this.env, 
            this.parseMode, 
            this.dismissable);
        this.lastSendSuccessful = sentMsgInfo.success;
        return this;
    }
    private async remove() : Promise<TGStatusMessage> {
        const result = await deleteTGMessage(this.messageID, this.chatID, this.env);
        this.deleted = result.success;
        return this;
    }
}