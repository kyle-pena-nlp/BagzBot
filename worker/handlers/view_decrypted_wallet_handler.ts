import * as Menus from "../../menus";
import * as Util from "../../util";
import { BaseMenuCodeHandler } from "./base_menu_code_handler";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { TGStatusMessage, TGMessageChannel } from "../../telegram";
import { logError, logDebug, logInfo } from "../../logging";
import { readSessionObj, storeSessionObj, storeSessionObjProperty } from "../../durable_objects/user/userDO_interop";

export class ViewDecryptedWalletHandler extends BaseMenuCodeHandler<MenuCode.ViewDecryptedWallet> {
    constructor(menuCode : MenuCode.ViewDecryptedWallet) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        if (params.isImpersonatingAUser()) {
            return new Menus.MenuContinueMessage('Not permitted to view an impersonated users private key', MenuCode.Main, env);
        }
        const walletDataResponse = await getWalletData(params.getTelegramUserID(), params.chatID, env);
        const decryptedPrivateKey = await decryptPrivateKey(walletDataResponse.wallet.encryptedPrivateKey, params.getTelegramUserID(), env);
        return new Menus.MenuViewDecryptedWallet({ publicKey: walletDataResponse.wallet.publicKey, decryptedPrivateKey: decryptedPrivateKey }, env)
    }
}
