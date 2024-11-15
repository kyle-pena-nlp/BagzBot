import { parsePriorityFeeOptions } from "../env";
import { CallbackButton } from "../telegram";
import { FormattedTable, tryParseInt } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuEditOpenPositionSellPriorityFee extends Menu<{ positionID : string }> implements MenuCapabilities {
    renderText(): string {
        
        const lines = [
            `<b><u>Priority Fees Help Your Trade Get Executed First</u></b>`,
        ];

        const table = new FormattedTable([10], 'bulleted');

        table.addLine(`Default`, '75th percentile of recent priority fees');

        for (const [multiplier,multiplierName] of parsePriorityFeeOptions(this.env)) {
            table.addLine(`${multiplierName}`, `${multiplier} times the Default`);
        }

        table.appendTo(lines);
        
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        const autoPriorityFeeCallbackData = new PositionIDAndPriorityFeeMultiplier(this.menuData.positionID, "auto");
        this.insertButtonNextLine(options, "Default", new CallbackData(MenuCode.EditOpenPositionSubmitPriorityFee, autoPriorityFeeCallbackData.asMenuArg()));
        for (const [multiplier,multiplierName] of parsePriorityFeeOptions(this.env)) {
            const multiplierCallbackData = new PositionIDAndPriorityFeeMultiplier(this.menuData.positionID, multiplier);
            this.insertButtonSameLine(options, `${multiplierName}`, new CallbackData(MenuCode.EditOpenPositionSubmitPriorityFee, multiplierCallbackData.asMenuArg()));
        }
        this.insertButtonNextLine(options, ':back: Back', new CallbackData(MenuCode.ViewOpenPosition, this.menuData.positionID));
        return options;
    }
}

export class PositionIDAndPriorityFeeMultiplier {
    positionID : string
    multiplier : 'auto'|number
    constructor(positionID : string, priorityFee : 'auto'|number) {
        this.positionID = positionID;
        this.multiplier = priorityFee;
    }
    asMenuArg() : string {
        return `${this.positionID}|${this.multiplier}`;
    }
    static parse(key : string) : PositionIDAndPriorityFeeMultiplier|null {
        const tokens = key.split("|");
        if (tokens.length !== 2) {
            return null;
        }
        const positionID = tokens[0];
        const multiplier = tryParseInt(tokens[1])||(tokens[1]);
        if (multiplier !== 'auto' && typeof multiplier === 'string') {
            return null;
        }
        return new PositionIDAndPriorityFeeMultiplier(positionID, multiplier);
    }
}