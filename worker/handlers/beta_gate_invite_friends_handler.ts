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

export class BetaGateInviteFriendsHandler extends BaseMenuCodeHandler<MenuCode.BetaGateInviteFriends> {
    constructor(menuCode : MenuCode.BetaGateInviteFriends) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const unclaimedBetaCodes = await listUnclaimedBetaInviteCodes({ userID : params.getTelegramUserID() }, env);
        if (!unclaimedBetaCodes.success) {
            return this.createMainMenu(params, env);
        }
        const botUserName = env.TELEGRAM_BOT_USERNAME;
        return new Menus.MenuBetaInviteFriends({betaInviteCodes: unclaimedBetaCodes.data.betaInviteCodes, botUserName: botUserName }, env);
    }
}
