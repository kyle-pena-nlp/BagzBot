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
    parseMode: 'HTML'|'MarkdownV2'
    constructor(question : string, replyQuestionCode: ReplyQuestionCode, nextMenuCode : MenuCode, backMenuCode ?: MenuCode, parseMode : 'HTML'|'MarkdownV2' = 'HTML') {
        this.question = question;
        this.replyQuestionCode = replyQuestionCode;
        this.nextMenuCode = nextMenuCode;
        this.backMenuCode = backMenuCode;
        this.parseMode = parseMode;
    }
    async sendReplyQuestion(telegramUserID : number, chatID : number, messageID : number, env : Env) : Promise<Response> {
        const replyQuestionCallbackData = { 
            replyQuestionCode: this.replyQuestionCode,
            nextMenuCode : this.nextMenuCode,
            backMenuCode : this.backMenuCode
        };
        await storeSessionObj<SessionReplyQuestion>(telegramUserID, messageID, replyQuestionCallbackData, "replyQuestion", env);
        const request = this.getReplyQuestionRequest(chatID, messageID, env);
        const response = await fetch(request);
        return response;
    }
    private getReplyQuestionRequest(chatID : number, messageID : number, env : Env) {
        const method = 'sendMessage';
        const url = makeTelegramBotUrl(method, env);
        const body : any = { 
            chat_id: chatID,
            reply_parameters: {
                message_id : messageID,
                chat_id : chatID,
                text: this.question,
                parse_mode: this.parseMode,
                allow_sending_without_reply: false
            }           
        };        
        const request = makeJSONRequest(url, body);
        return request;
    }
}