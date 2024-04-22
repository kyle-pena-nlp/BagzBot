import { DecimalizedAmount } from "../../decimalized";
import { getClosedPositionsAndPNLSummary } from "../../durable_objects/user/userDO_interop";
import { Env } from "../../env";
import * as Menus from "../../menus";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion } from "../../reply_question";
import * as Util from "../../util";
import { groupIntoMap } from "../../util";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { BaseMenuCodeHandler, MenuCodeHandlerCapabilities } from "./base_menu_code_handler";

export class ViewPNLHistoryHandler extends BaseMenuCodeHandler<MenuCode.ViewPNLHistory> implements MenuCodeHandlerCapabilities {
    constructor(menuCode : MenuCode.ViewPNLHistory) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, maybeSOLBalance : DecimalizedAmount|null, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const closedPositionsAndPNLSummary = await getClosedPositionsAndPNLSummary(params.getTelegramUserID(), params.chatID, env);
        const pnlHistoryPageIndex = Util.tryParseInt(params.callbackData.menuArg||'')||0;
        const groupedClosedPositions = [...groupIntoMap(closedPositionsAndPNLSummary.closedPositions, x => x.token.address).values()];
        groupedClosedPositions.sort(x => Math.min(...x.map(y => -(y.txSellAttemptTimeMS||0))));
        return new Menus.MenuPNLHistory({
            items: groupedClosedPositions,
            netPNL: closedPositionsAndPNLSummary.closedPositionsPNLSummary.netSOL,
            pageIndex: pnlHistoryPageIndex
        }, env);
    }
}
