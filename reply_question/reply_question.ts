import { storeSessionObj } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { MenuCode } from "../menus";
import { sendQuestionToTG } from "../telegram/telegram_helpers";
import { ReplyQuestionCode } from "./reply_question_code";
import { SessionReplyQuestion } from "./session_reply_question";

export class ReplyQuestion {
    question : string
    replyQuestionCode : ReplyQuestionCode
    nextMenuCode : MenuCode
    backMenuCode: MenuCode|undefined
    parseMode: 'HTML'|'MarkdownV2'
    constructor(question : string, replyQuestionCode: ReplyQuestionCode, nextMenuCode : MenuCode, backMenuCode ?: MenuCode, parseMode : 'HTML'|'MarkdownV2' = 'HTML') {
        this.question = question;
        this.replyQuestionCode = replyQuestionCode;
        this.nextMenuCode = nextMenuCode;
        this.backMenuCode = backMenuCode;
        this.parseMode = parseMode;
    }
    async sendReplyQuestion(telegramUserID : number, chatID : number, env : Env) {
        const tgSentMessageInfo = await sendQuestionToTG(chatID, this.question, env, this.parseMode);
        if (!tgSentMessageInfo.success) {
            return;
        }
        const replyQuestionCallbackData = { 
            replyQuestionCode: this.replyQuestionCode,
            nextMenuCode : this.nextMenuCode,
            backMenuCode : this.backMenuCode
        };  
        // TODO: how to resolve possibility that user could respond before storage is completed?      
        await storeSessionObj<SessionReplyQuestion>(telegramUserID, tgSentMessageInfo.messageID, replyQuestionCallbackData, "replyQuestion", env);
    }
}