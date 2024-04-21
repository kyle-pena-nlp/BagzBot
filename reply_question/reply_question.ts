import { storeSessionObj } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { MenuCode } from "../menus";
import { subInEmojis } from "../telegram";
import { SuccessfulTgMessageSentInfo, sendQuestionToTG } from "../telegram/telegram_helpers";
import { ReplyQuestionCode } from "./reply_question_code";
import { ReplyQuestionData } from "./reply_question_data";

export interface ReplyQuestionOptions {
    callback ?: ReplyQuestionCallback
    parseMode ?: 'HTML'|'MarkdownV2'
    timeoutMS ?: number
}

export interface ReplyQuestionCallback {
    linkedMessageID : number // optionally associates this reply with an original message
    nextMenuCode : MenuCode
    menuArg ?: string
}

export class ReplyQuestion {
    
    question : string
    replyQuestionCode : ReplyQuestionCode
    context : FetchEvent
    parseMode: 'HTML'|'MarkdownV2'
    timeoutMS : number|undefined
    hasNextSteps : boolean

    // these optional fields are only present if there is a callback ('next step' for the reply question)
    linkedMessageID ?: number
    nextMenuCode ?: MenuCode
    menuArg ?: string

    constructor(question : string,
        replyQuestionCode: ReplyQuestionCode, 
        context : FetchEvent,
        opts ?: ReplyQuestionOptions) {
        this.question = subInEmojis(question);
        this.replyQuestionCode = replyQuestionCode;
        this.context = context;
        opts = opts || {};
        this.hasNextSteps = opts.callback != null;
        this.linkedMessageID = opts?.callback?.linkedMessageID;
        this.nextMenuCode = opts?.callback?.nextMenuCode;
        this.menuArg = opts?.callback?.menuArg;
        this.parseMode = opts?.parseMode || 'HTML';
        this.timeoutMS = opts?.timeoutMS;
    }
    async sendReplyQuestionToTG(telegramUserID : number, chatID : number, env : Env) : Promise<void> {
        const tgSentMessageInfo = await sendQuestionToTG(chatID, this.question, this.context, env, this.parseMode, this.timeoutMS);
        if (!tgSentMessageInfo.success) {
            return;
        }
        const replyQuestionCallbackData = this.createReplyQuestionSessionObject(tgSentMessageInfo); 
        // Problem: Reply questions don't work if the user responds before this is stored.
        // Yet, the question is sent to the user *before* this is stored.
        // How can I mitigate this risk? 
        // TODO: how to resolve possibility that user could respond before storage is completed?  
        // Some kind of incoming message blocking here?  But per-user, so we don't lock the whole app.    
        await storeSessionObj<ReplyQuestionData>(telegramUserID, chatID, tgSentMessageInfo.messageID, replyQuestionCallbackData, "replyQuestion", env);
    }
    createReplyQuestionSessionObject(tgSentMessageInfo : SuccessfulTgMessageSentInfo) : ReplyQuestionData {
        if (this.replyQuestionHasNextSteps()) {
            return { 
                messageQuestionID : tgSentMessageInfo.messageID,
                replyQuestionCode: this.replyQuestionCode,
                linkedMessageID: this.linkedMessageID,
                nextMenuCode : this.nextMenuCode,
                menuArg: this.menuArg||null
            }
        }
        else {
            return {
                replyQuestionCode: this.replyQuestionCode,
                messageQuestionID : tgSentMessageInfo.messageID
            };
        }
    }
    private replyQuestionHasNextSteps() : this is ReplyQuestion & { linkedMessageID : number, nextMenuCode : MenuCode } {
        return this.hasNextSteps;
    }
}