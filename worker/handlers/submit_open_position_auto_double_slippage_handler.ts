import { DecimalizedAmount } from "../../decimalized";
import { setSellAutoDoubleOnOpenPosition } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitOpenPositionAutoDoubleSlippageHandler extends BaseMenuCodeHandler<MenuCode.SubmitOpenPositionAutoDoubleSlippage> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitOpenPositionAutoDoubleSlippage) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const posIDAndChoice = Menus.PositionIDAndChoice.parse(callbackData.menuArg||'');
        if (posIDAndChoice == null) {
            return this.sorryError(env);
        }
        const posID = posIDAndChoice.positionID;
        const choice = posIDAndChoice.choice;
        await setSellAutoDoubleOnOpenPosition(params.getTelegramUserID(), params.chatID, posID, choice, env);
        return this.makeOpenPositionMenu(params,posID,env);
    }
}
