import { DecimalizedAmount } from "../../decimalized";
import { setOpenPositionSellPriorityFeeMultiplier } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class EditOpenPositionSubmitPriorityFeeHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionSubmitPriorityFee> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.EditOpenPositionSubmitPriorityFee) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const thing = Menus.PositionIDAndPriorityFeeMultiplier.parse(callbackData.menuArg||'');
        if (thing == null) {
            return new Menus.MenuContinueMessage(`Sorry - that selection was not recognized as valid`, MenuCode.Main, env);
        }
        await setOpenPositionSellPriorityFeeMultiplier(params.getTelegramUserID(), params.chatID, thing.positionID, thing.multiplier, env);
        return await this.makeOpenPositionMenu(params, thing.positionID, env);
    }
}
