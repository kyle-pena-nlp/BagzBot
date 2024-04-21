import { isAdminOrSuperAdmin } from "../../admins";
import { DecimalizedAmount } from "../../decimalized";
import { adminDeletePositionByID } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitAdminDeletePositionByIDHandler extends BaseMenuCodeHandler<MenuCode.SubmitAdminDeletePositionByID> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitAdminDeletePositionByID) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const positionIDtoDelete = callbackData.menuArg||'';
        if (!isAdminOrSuperAdmin(params.getTelegramUserID('real'), env)) {
            return new Menus.MenuContinueMessage("You do not have permission to do that", MenuCode.Main, env);
        }
        const adminDeletePositionResponse = await adminDeletePositionByID(params.getTelegramUserID(), params.chatID, positionIDtoDelete, env);
        const adminDeletePositionByIDMsg = adminDeletePositionResponse.success ? `Position with ID ${positionIDtoDelete} was deleted` : `Position with ID ${positionIDtoDelete} could not be deleted (might already not exist)`;
        return new Menus.MenuContinueMessage(adminDeletePositionByIDMsg, MenuCode.Main, env);
    }
}
