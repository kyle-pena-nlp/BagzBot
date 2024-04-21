import { DecimalizedAmount } from "../../decimalized";
import { editTriggerPercentOnOpenPositionFromUserDO } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionIDAndTriggerPercent } from "../../menus/menu_edit_open_position_trigger_percent";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class EditOpenPositionSubmitCustomTriggerPercentHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionSubmitCustomTriggerPercent> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.EditOpenPositionSubmitCustomTriggerPercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const messageID = params.messageID;
        const positionIDAndTriggerPercent = PositionIDAndTriggerPercent.gracefulParse(callbackData.menuArg||'');
        if (positionIDAndTriggerPercent == null) {
            return new Menus.MenuContinueMessage('Sorry - there was an unexpected problem', MenuCode.Main, env);
        }
        else if ('percent' in positionIDAndTriggerPercent &&  positionIDAndTriggerPercent.percent > 0 && positionIDAndTriggerPercent.percent < 100) {
            await editTriggerPercentOnOpenPositionFromUserDO(params.getTelegramUserID(), params.chatID, positionIDAndTriggerPercent.positionID, positionIDAndTriggerPercent.percent, env);
            return await this.makeOpenPositionMenu(params, positionIDAndTriggerPercent.positionID, env);
        }
        else {
            return new Menus.MenuContinueMessage('Sorry - that was an invalid percentage', MenuCode.ViewOpenPosition, env, 'HTML', positionIDAndTriggerPercent.positionID);
        }
    }
}
