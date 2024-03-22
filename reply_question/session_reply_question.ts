import { MenuCode } from "../menus";
import { Structural } from "../util";
import { ReplyQuestionCode } from "./reply_question_code";

export interface SessionReplyQuestion {
    readonly [ key : string ] : Structural
    replyQuestionCode: ReplyQuestionCode
    nextMenuCode? : MenuCode
    backMenuCode? : MenuCode
}