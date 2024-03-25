import { storeSessionObj } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { MenuCode } from "../menus";
import { sendQuestionToTG } from "../telegram/telegram_helpers";
import { ReplyQuestionCode } from "./reply_question_code";
import { ReplyQuestionData } from "./reply_question_data";

export interface ReplyQuestionCallback {
    linkedMessageID : number // optionally associates this reply with an original message
    nextMenuCode : MenuCode
}

export class ReplyQuestion {
    question : string
    
    replyQuestionCode : ReplyQuestionCode
    linkedMessageID ?: number
    nextMenuCode ?: MenuCode
    parseMode: 'HTML'|'MarkdownV2'
    constructor(question : string,
        replyQuestionCode: ReplyQuestionCode, 
        callback ?: ReplyQuestionCallback,
        parseMode : 'HTML'|'MarkdownV2' = 'HTML') {
        this.question = question;
        this.replyQuestionCode = replyQuestionCode;
        this.linkedMessageID = callback?.linkedMessageID;
        this.nextMenuCode = callback?.nextMenuCode;
        this.parseMode = parseMode;
    }
    async sendReplyQuestion(telegramUserID : number, chatID : number, env : Env) {
        const tgSentMessageInfo = await sendQuestionToTG(chatID, this.question, env, this.parseMode);
        if (!tgSentMessageInfo.success) {
            return;
        }
        const replyQuestionCallbackData : ReplyQuestionData = { 
            messageQuestionID : tgSentMessageInfo.messageID,
            replyQuestionCode: this.replyQuestionCode,
            linkedMessageID: this.linkedMessageID,
            nextMenuCode : this.nextMenuCode
        }; 
        // Problem: Reply questions don't work if the user responds before this is stored.
        // Yet, the question is sent to the user *before* this is stored.
        // How can I mitigate this risk? 
        // TODO: how to resolve possibility that user could respond before storage is completed?  
        // Some kind of incoming message blocking here?  But per-user, so we don't lock the whole app.    
        await storeSessionObj<ReplyQuestionData>(telegramUserID, tgSentMessageInfo.messageID, replyQuestionCallbackData, "replyQuestion", env);
    }
}