import { MenuCode } from "../menus";

export class ReplyQuestion {
    question : string
    nextMenuCode : MenuCode
    backMenuCode: MenuCode
    constructor(question : string, nextMenuCode : MenuCode, backMenuCode: MenuCode) {
        this.question = question;
        this.nextMenuCode = nextMenuCode;
        this.backMenuCode = backMenuCode;
    }
}