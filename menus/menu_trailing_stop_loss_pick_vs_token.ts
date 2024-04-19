import { TokenSymbolAndAddress } from "../durable_objects/user/model/token_name_and_address";
import { CallbackButton } from "../telegram";
import { getVsTokenInfo } from "../tokens";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuTrailingStopLossPickVsToken extends Menu<TokenSymbolAndAddress> implements MenuCapabilities {
    renderText(): string {
        return 'Choose which token to buy your position with.';
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const SOL = getVsTokenInfo('SOL');
        const USDC = getVsTokenInfo('USDC');
        this.insertButtonNextLine(options, SOL.symbol,  new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenuSubmit, SOL.symbol));
        this.insertButtonNextLine(options, USDC.symbol, new CallbackData(MenuCode.TrailingStopLossPickVsTokenMenuSubmit, USDC.symbol));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(MenuCode.ReturnToPositionRequestEditor));
        return options;
    }
}