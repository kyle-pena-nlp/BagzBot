import { DecimalizedAmount } from "../../decimalized";
import { TokenSymbolAndAddress } from "../../durable_objects/user/model/token_name_and_address";
import { getPositionFromUserDO, getUserData, manuallyClosePosition, readSessionObj, sendMessageToUser } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import { makeFakeFailedRequestResponse, makeSuccessResponse } from "../../http";
import * as Menus from "../../menus";
import { PositionRequest } from "../../positions";
import { ReplyQuestion } from "../../reply_question";
import { quoteBuy } from "../../rpc/jupiter_quotes";
import { isGetQuoteFailure } from "../../rpc/rpc_types";
import { POSITION_REQUEST_STORAGE_KEY } from "../../storage_keys";
import { TelegramWebhookInfo, deleteTGMessage } from "../../telegram";
import * as Util from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";

export interface MenuCodeHandlerCapabilities {
    handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<Menus.BaseMenu|ReplyQuestion|void>;
}

export class BaseMenuCodeHandler<T extends Menus.MenuCode> {

    protected menuCode : T
    
    constructor(menuCode : T) {
        this.menuCode = menuCode;
    }
    
    getMenuCode() : Menus.MenuCode {
        return this.menuCode;
    }
    
    // TODO: cleanup / factor out these misc private & protected methods

    protected async handleMenuClose(chatID : number, messageID : number, env : Env) : Promise<Response> {
        const result = await deleteTGMessage(messageID, chatID, env);
        if (!result.success) {
            return makeFakeFailedRequestResponse(500, "Couldn't delete message");
        }
        else {
            return makeSuccessResponse();
        }
    }

    protected async handleManuallyClosePosition(telegramUserID : number, chatID : number, positionID : string, env : Env) : Promise<Response> {
        const result = await manuallyClosePosition(telegramUserID, chatID, positionID, env);
        return makeSuccessResponse();
    }    

    protected async makeStopLossRequestEditorMenu(positionRequest : PositionRequest, maybeSOLBalance : DecimalizedAmount|null, env : Env) : Promise<Menus.BaseMenu> {
        await this.refreshQuote(positionRequest, env);
        return new Menus.MenuEditPositionRequest({ positionRequest, maybeSOLBalance }, env);
    }   
    
    protected sorryError(env : Env, menuCode ?: Menus.MenuCode, menuArg ?: string) : Menus.MenuContinueMessage {
        return new Menus.MenuContinueMessage(`We're sorry - an error has occurred`, menuCode || Menus.MenuCode.Main, env, 'HTML', menuArg);
    }

    protected async getTrailingStopLossPositionVsTokenFromSession(telegramUserID : number, chatID : number, messageID : number, env : Env) : Promise<TokenSymbolAndAddress> {
        const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
        return {
            tokenSymbol: positionRequest.vsToken.symbol,
            tokenAddress: positionRequest.vsToken.address
        };
    }

    protected async makeOpenPositionMenu(params : CallbackHandlerParams, positionID : string, env: Env) : Promise<Menus.BaseMenu> {
        const positionAndMaybePNL = await getPositionFromUserDO(params.getTelegramUserID(), params.chatID, positionID, env);
        if (positionAndMaybePNL == null) {
            return this.sorryError(env);
        }
        return new Menus.MenuViewOpenPosition({ data: positionAndMaybePNL }, env);
    }

    protected async sendBetaFeedbackToSuperAdmin(feedback : string, myUserName : string, myUserID : number, env : Env) : Promise<void> {
        await sendMessageToUser(Util.strictParseInt(env.SUPER_ADMIN_USER_ID), myUserName, myUserID,feedback, env);
    }  
    

    protected async refreshQuote(positionRequest : PositionRequest, env : Env) : Promise<boolean> {
        const quote = await quoteBuy(positionRequest, positionRequest.token, env);
        if (isGetQuoteFailure(quote)) {
            return false;
        }
        positionRequest.quote = quote;
        return true;
    }    

    protected async createMainMenu(info : CallbackHandlerParams | TelegramWebhookInfo, env : Env) : Promise<Menus.BaseMenu> {
        const userData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
        return new Menus.MenuMain({ ...userData, ...this.makeAdminInfo(info, env) }, env);
    }    

    private makeAdminInfo(info : CallbackHandlerParams | TelegramWebhookInfo, env : Env) : Menus.AdminInfo {
        return { 
            isAdminOrSuperAdmin: info.isAdminOrSuperAdmin(env), 
            isImpersonatingUser: info.isImpersonatingAUser(),
            impersonatedUserID: info.isImpersonatingAUser() ? info.getTelegramUserID() : undefined
        };
    }    
}