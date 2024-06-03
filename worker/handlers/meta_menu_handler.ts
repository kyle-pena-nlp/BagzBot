import { DecimalizedAmount } from "../../decimalized";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { MetaMenu, MetaMenuSpec } from "../../menus/meta_menu";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";


export class MetaMenuHandler<T extends MenuCode> extends BaseMenuCodeHandler<T> implements MenuCodeHandlerCapabilities {
    private metaMenuSpec : MetaMenuSpec;
    constructor(menuCode : T, metaMenuSpec : MetaMenuSpec) {
        super(menuCode);
        this.metaMenuSpec  = metaMenuSpec;
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        return new MetaMenu(this.metaMenuSpec, env);
    }
    
}