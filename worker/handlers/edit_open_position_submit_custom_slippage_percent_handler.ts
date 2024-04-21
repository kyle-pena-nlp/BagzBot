import { DecimalizedAmount } from "../../decimalized";
import { setSellSlippagePercentOnOpenPosition } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionIDAndSellSlippagePercent } from "../../menus/menu_edit_open_position_sell_slippage_percent";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class EditOpenPositionSubmitCustomSlippagePercentHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionSubmitCustomSlippagePercent> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.EditOpenPositionSubmitCustomSlippagePercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const positionIDAndSlippagePercent = PositionIDAndSellSlippagePercent.gracefulParse(callbackData.menuArg||'');
        if (positionIDAndSlippagePercent == null) {
            return new Menus.MenuContinueMessage('Sorry - that was an unexpected problem', MenuCode.Main, env);
        }
        if ('sellSlippagePercent' in positionIDAndSlippagePercent && positionIDAndSlippagePercent.sellSlippagePercent > 0 && positionIDAndSlippagePercent.sellSlippagePercent < 100) {
            await setSellSlippagePercentOnOpenPosition(params.getTelegramUserID(), params.chatID, positionIDAndSlippagePercent.positionID, positionIDAndSlippagePercent.sellSlippagePercent, env);
            return await this.makeOpenPositionMenu(params, positionIDAndSlippagePercent.positionID, env);
        }
        else {
            return new Menus.MenuContinueMessage('Sorry - that was an invalid percentage', MenuCode.ViewOpenPosition, env, 'HTML', positionIDAndSlippagePercent.positionID);
        }
    }
}
