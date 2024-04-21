import { MenuCode } from "../menus";
import { Structural } from "../util";
import { ReplyQuestionCode } from "./reply_question_code";

export interface ReplyQuestionWithNextSteps {
    readonly [ key : string ] : Exclude<Structural,undefined>
    messageQuestionID : number
    replyQuestionCode: ReplyQuestionCode
    linkedMessageID : number
    nextMenuCode : MenuCode
    menuArg : string|null
}

export interface StandAloneSessionReplyQuestion {
    readonly [ key : string ] : Exclude<Structural,undefined>
    replyQuestionCode: ReplyQuestionCode
    messageQuestionID : number
}

export function replyQuestionHasNextSteps(replyQuestion : ReplyQuestionData) : replyQuestion is ReplyQuestionWithNextSteps {
    return replyQuestion.linkedMessageID != null;
}

export type ReplyQuestionData = ReplyQuestionWithNextSteps | StandAloneSessionReplyQuestion;