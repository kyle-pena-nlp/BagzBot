import { storeSessionObj } from "../durable_objects/user/userDO_interop";
import { Env } from "../env";
import { MenuCode } from "../menus";
import { makeTelegramBotUrl } from "../telegram";
import { makeJSONRequest } from "../util";
import { ReplyQuestionCode } from "./reply_question_code";
import { SessionReplyQuestion } from "./session_reply_question";

export class ReplyQuestion {
    question : string
    replyQuestionCode : ReplyQuestionCode
    nextMenuCode : MenuCode
    backMenuCode: MenuCode|undefined
    constructor(question : string, replyQuestionCode: ReplyQuestionCode, nextMenuCode : MenuCode, backMenuCode ?: MenuCode) {
        this.question = question;
        this.replyQuestionCode = replyQuestionCode;
        this.nextMenuCode = nextMenuCode;
        this.backMenuCode = backMenuCode;
    }
    async sendReplyQuestion(telegramUserID : number, chatID : number, messageID : number, env : Env) : Promise<Response> {
        const replyQuestionCallbackData = { 
            replyQuestionCode: this.replyQuestionCode,
            nextMenuCode : this.nextMenuCode,
            backMenuCode : this.backMenuCode
        };
        storeSessionObj<SessionReplyQuestion>(telegramUserID, messageID, replyQuestionCallbackData, "replyQuestion", env);
        const request = this.getReplyQuestionRequest(chatID, messageID, env);
        return await fetch(request);
    }
    private getReplyQuestionRequest(chatID : number, messageID : number, env : Env) {
        const method = 'editMessageText';
        const url = makeTelegramBotUrl(method, env);
        const body : any = { 
            chat_id: chatID,
            message_id: messageID            
        };        
        const request = makeJSONRequest(url, body);
        return request;
    }
}