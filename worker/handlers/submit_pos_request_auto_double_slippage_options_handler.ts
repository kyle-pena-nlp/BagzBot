import { DecimalizedAmount } from "../../decimalized";
import { readSessionObj, storeSessionObjProperty } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class SubmitPosRequestAutoDoubleSlippageOptionsHandler extends BaseMenuCodeHandler<MenuCode.SubmitPosRequestAutoDoubleSlippageOptions> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.SubmitPosRequestAutoDoubleSlippageOptions) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const opAutoDoubleSlippage = Util.tryParseBoolean((callbackData.menuArg||'').trim());
        if (opAutoDoubleSlippage == null) {
            return this.sorryError(env);
        }
        else {
            await storeSessionObjProperty<PositionRequest>(params.getTelegramUserID(),
                params.chatID,
                params.messageID,
                "sellAutoDoubleSlippage",
                opAutoDoubleSlippage,
                POSITION_REQUEST_STORAGE_KEY,
                env);
            const pr = await readSessionObj<PositionRequest>(
                params.getTelegramUserID(),
                params.chatID,
                params.messageID,
                POSITION_REQUEST_STORAGE_KEY,
                env);
            return new Menus.MenuEditPositionRequest({ positionRequest: pr, maybeSOLBalance }, env);
        }
    }
}
