import { CallbackButton } from "../telegram";
import { tryParseFloat } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class PositionIDAndSellSlippagePercent {
    positionID : string
    sellSlippagePercent : number
    constructor(positionID : string, sellSlippagePercent : number) {
        this.positionID = positionID;
        this.sellSlippagePercent = sellSlippagePercent;
    }
    static parse(menuArg : string) : PositionIDAndSellSlippagePercent|null {
        const tokens = menuArg.split("|");
        if (tokens.length !== 2) {
            return null;
        }
        const [positionID,sellSlippagePercentString] = tokens;
        const sellSlippagePercent = tryParseFloat(sellSlippagePercentString);
        if (sellSlippagePercent == null) {
            return null;
        }
        return new PositionIDAndSellSlippagePercent(positionID,sellSlippagePercent);
    }
    asMenuArg() : string {
        return `${this.positionID}|${this.sellSlippagePercent}`
    }
}

export class MenuEditOpenPositionSellSlippagePercent extends Menu<{ positionID: string }> implements MenuCapabilities {
    renderText(): string {
        return `Set the slippage percent used when automatically selling the position.`
    }
    renderOptions(): CallbackButton[][] {
        const positionID = this.menuData.positionID;
        const options = this.emptyMenu();
        const percentageOptions = [1,5,10];
        for (const percentOption of percentageOptions) {
            this.insertButtonNextLine(options, `${percentOption}%`, new CallbackData(MenuCode.SubmitOpenPositionSellSlippagePercent, new PositionIDAndSellSlippagePercent(positionID,percentOption).asMenuArg()));
        }
        this.insertButtonNextLine(options, `:back: Back`, new CallbackData(MenuCode.ViewOpenPosition, positionID));
        return options;
    }
}