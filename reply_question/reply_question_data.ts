import { MenuCode } from "../menus";
import { Structural } from "../util";
import { ReplyQuestionCode } from "./reply_question_code";

export interface ReplyQuestionWithNextSteps {
    readonly [ key : string ] : Structural
    messageQuestionID : number
    replyQuestionCode: ReplyQuestionCode
    linkedMessageID : number
    nextMenuCode : MenuCode
}

export interface StandAloneSessionReplyQuestion {
    readonly [ key : string ] : Structural
    replyQuestionCode: ReplyQuestionCode
    messageQuestionID : number
}

export function replyQuestionHasNextSteps(replyQuestion : ReplyQuestionData) : replyQuestion is ReplyQuestionWithNextSteps {
    return replyQuestion.linkedMessageID != null;
}

export type ReplyQuestionData = ReplyQuestionWithNextSteps | StandAloneSessionReplyQuestion;