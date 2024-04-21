import { decryptPrivateKey } from "../../crypto";
import { DecimalizedAmount } from "../../decimalized";
import { getWalletData } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ViewDecryptedWalletHandler extends BaseMenuCodeHandler<MenuCode.ViewDecryptedWallet> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ViewDecryptedWallet) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        if (params.isImpersonatingAUser()) {
            return new Menus.MenuContinueMessage('Not permitted to view an impersonated users private key', MenuCode.Main, env);
        }
        const walletDataResponse = await getWalletData(params.getTelegramUserID(), params.chatID, env);
        const decryptedPrivateKey = await decryptPrivateKey(walletDataResponse.wallet.encryptedPrivateKey, params.getTelegramUserID(), env);
        return new Menus.MenuViewDecryptedWallet({ publicKey: walletDataResponse.wallet.publicKey, decryptedPrivateKey: decryptedPrivateKey }, env)
    }
}
