import { DecimalizedAmount } from "../../decimalized";
import { QuantityAndToken } from "../../durable_objects/user/model/quantity_and_token";
import { readSessionObj } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class TrailingStopLossEntryBuyQuantityMenuHandler extends BaseMenuCodeHandler<MenuCode.TrailingStopLossEntryBuyQuantityMenu> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.TrailingStopLossEntryBuyQuantityMenu) {
        super(menuCode);
    }
    
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const messageID = params.messageID;
        const quantityAndToken : QuantityAndToken = await this.getTSLRequestVsTokenQuantityAndSymbol(params.getTelegramUserID(), params.chatID, messageID, env);
        return new Menus.MenuChooseBuyQuantity({ 
            text: `Choose ${quantityAndToken.thisTokenSymbol} quantity`,
            submitMenuCode: MenuCode.SubmitBuyQuantity,
            backMenuCode: MenuCode.ReturnToPositionRequestEditor,
            customBuyQuantityMenuCode: MenuCode.CustomBuyQuantity 
        }, { quantityAndToken }, env);
    }

    protected async getTSLRequestVsTokenQuantityAndSymbol(telegramUserID : number, chatID : number, messageID : number, env: Env) : Promise<QuantityAndToken> {
        const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return {
            thisTokenSymbol:  positionRequest.vsToken.symbol,
            thisTokenAddress: positionRequest.vsToken.address,
            quantity: positionRequest.vsTokenAmt
        };
    }    
}
