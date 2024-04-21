import { DecimalizedAmount } from "../../decimalized";
import { listUnclaimedBetaInviteCodes } from "../../durable_objects/beta_invite_codes/beta_invite_code_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class BetaGateInviteFriendsHandler extends BaseMenuCodeHandler<MenuCode.BetaGateInviteFriends> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.BetaGateInviteFriends) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const unclaimedBetaCodes = await listUnclaimedBetaInviteCodes({ userID : params.getTelegramUserID() }, env);
        if (!unclaimedBetaCodes.success) {
            return this.createMainMenu(params, env);
        }
        const botUserName = env.TELEGRAM_BOT_USERNAME;
        return new Menus.MenuBetaInviteFriends({betaInviteCodes: unclaimedBetaCodes.data.betaInviteCodes, botUserName: botUserName }, env);
    }
}
