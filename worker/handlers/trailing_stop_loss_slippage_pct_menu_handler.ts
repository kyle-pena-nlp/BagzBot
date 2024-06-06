import { DecimalizedAmount } from "../../decimalized";
import { readSessionObj } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class TrailingStopLossSlippagePctMenuHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossSlippagePctMenu> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.TrailingStopLossSlippagePctMenu) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const x = await readSessionObj<PositionRequest>(params.getTelegramUserID(), params.chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        const slippagePercent = x.slippagePercent;
        return new Menus.MenuChooseSlippagePercent({
            text: `Pick a Slippage Percent tolerance. The same percentage will apply on the automatic sell.`,
            submitMenuCode: MenuCode.SubmitSlippagePct,
            backMenuCode: MenuCode.ReturnToPositionRequestEditor,
            chooseCustomSlippagePctMenuCode: MenuCode.CustomSlippagePct,
            defaultCustomSlippagePercent: slippagePercent
        }, env);
    }
}
