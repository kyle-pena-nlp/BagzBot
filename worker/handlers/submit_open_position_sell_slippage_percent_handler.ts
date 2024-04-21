import { DecimalizedAmount } from "../../decimalized";
import { setSellSlippagePercentOnOpenPosition } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionIDAndSellSlippagePercent } from "../../menus/menu_edit_open_position_sell_slippage_percent";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitOpenPositionSellSlippagePercentHandler extends BaseMenuCodeHandler<MenuCode.SubmitOpenPositionSellSlippagePercent> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitOpenPositionSellSlippagePercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const positionIDAndSellSlippagePercent = PositionIDAndSellSlippagePercent.parse(callbackData.menuArg||'');
        if (positionIDAndSellSlippagePercent == null) {
            return this.sorryError(env);
        }
        const updatedPosition = await setSellSlippagePercentOnOpenPosition(params.getTelegramUserID(), params.chatID, positionIDAndSellSlippagePercent.positionID, positionIDAndSellSlippagePercent.sellSlippagePercent, env);
        if (updatedPosition.positionAndMaybePNL == null) {
            return this.sorryError(env);
        }
        return new Menus.MenuViewOpenPosition({ data: updatedPosition.positionAndMaybePNL }, env);
    }
}
