import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";

export class BaseMenuCodeHandler<T extends MenuCode> {
    protected menuCode : T
    constructor(menuCode : T) {
        this.menuCode = menuCode;
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        throw new Error("Not implemented");
    }
    getMenuCode() : MenuCode {
        return this.menuCode;
    }
}