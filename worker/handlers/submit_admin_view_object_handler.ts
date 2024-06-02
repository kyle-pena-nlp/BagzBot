import { isAdminOrSuperAdmin } from "../../admins";
import { DecimalizedAmount } from "../../decimalized";
import { AdminGetInfoRequest } from "../../durable_objects/user/actions/admin_get_info";
import { UserDOFetchMethod } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { makeJSONRequest } from "../../http";
import { logError } from "../../logging";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitAdminViewObjectHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminViewObject> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitAdminViewObject) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const id = callbackData.menuArg||'';
        if (!isAdminOrSuperAdmin(params.getTelegramUserID('real'), env)) {
            return new Menus.MenuContinueMessage("You do not have permission to do that", MenuCode.Main, env);
        }
        let description = "";
        try {
            const durableObjectID = env.UserDO.idFromString(id);
            const stub = env.UserDO.get(durableObjectID);
            const url = `http://userDO/${UserDOFetchMethod.adminGetInfo.toString()}`;
            const request = makeJSONRequest<AdminGetInfoRequest>(url, { isAdminGetInfo : true});
            const response = await stub.fetch(request);
            const jsonResponse = await response.json();
            description = JSON.stringify(jsonResponse);
        }
        catch(e : any) {
            logError(e.toString());
            description = "error."
        }

        return new Menus.MenuContinueMessage(description, MenuCode.Main, env);
    }
}
