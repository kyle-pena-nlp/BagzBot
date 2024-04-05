import { DecimalizedAmount, asTokenPriceDelta, toNumber } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { interpretPNLWithArrows } from "../telegram/emojis";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuPNLHistory extends Menu<{ closedPositions : Position[], netPNL : DecimalizedAmount }> implements MenuCapabilities {
    renderText(): string {
        const lines : string[] = [];
        this.addNetPNLSummary(lines);
        lines.push("");
        const closedPositions = this.menuData.closedPositions;
        for (const pos of closedPositions) {
            this.addClosedPositionSummary(lines, pos);
        }
        if (this.menuData.closedPositions.length == 0) {
            lines.push("<blockquote>Your don't have any closed positions yet!  Your total earnings will show here when you do.</blockquote>");
        }
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, `:refresh: Refresh`, new CallbackData(MenuCode.ViewPNLHistory));
        this.insertButtonNextLine(options, `:back: Back`, new CallbackData(MenuCode.Main))
        return options;
    }
    private addNetPNLSummary(lines : string[]) {
        lines.push("<u><b>PNL History</b></u>");
        const pnlEmoji = interpretPNLWithArrows(toNumber(this.menuData.netPNL));
        lines.push(`<b>Total Earnings</b>: ${asTokenPriceDelta(this.menuData.netPNL)} SOL ${pnlEmoji}`);
    }
    private addClosedPositionSummary(lines : string[], position : Position) {
        if (position.netPNL == null) {
            return;
        }
        const label = this.padRight(`$${position.token.symbol}: `, 6);
        const pnlString = this.padRight(`${asTokenPriceDelta(position.netPNL)}`, 10);
        lines.push(`<b>${label}</b>: ${pnlString} ${interpretPNLWithArrows(toNumber(position.netPNL))}`);
    }

    private padRight(text : string, length : number) : string {
        if (text.length < length) {
            return text + " ".repeat(length - text.length);
        }
        else {
            return text.slice(0, length);
        }
    }
}