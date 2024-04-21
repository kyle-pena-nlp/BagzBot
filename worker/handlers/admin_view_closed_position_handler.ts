import { isAdminOrSuperAdmin } from "../../admins";
import { DecimalizedAmount } from "../../decimalized";
import { getClosedPositionsAndPNLSummary } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { MenuViewObj } from "../../menus/menu_admin_view_obj";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class AdminViewClosedPositionHandler extends BaseMenuCodeHandler<MenuCode.AdminViewClosedPosition> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.AdminViewClosedPosition) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const closedPositions = (await getClosedPositionsAndPNLSummary(params.getTelegramUserID(), params.chatID, env)).closedPositions;
        const closedPosition = closedPositions.filter(p => p.positionID === callbackData.menuArg||'')[0];
        return new MenuViewObj({ data: closedPosition, isAdmin: isAdminOrSuperAdmin(params.getTelegramUserID('real'), env)}, env);
    }
}
