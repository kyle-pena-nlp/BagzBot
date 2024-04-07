import { DecimalizedAmount, asTokenPriceDelta } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { logoHack } from "./logo_hack";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuPNLHistory extends Menu<{ closedPositions : Position[], netPNL : DecimalizedAmount }> implements MenuCapabilities {
    renderText(): string {
        const lines : string[] = [];
        this.addHeader(lines);
        lines.push("");

        const closedPositions = this.menuData.closedPositions;
        closedPositions.sort((a,b) => (a.txBuyAttemptTimeMS||0 - b.txBuyAttemptTimeMS||0))
        for (const pos of closedPositions) {
            this.addClosedPositionSummary(lines, pos);
        }
        if (this.menuData.closedPositions.length == 0) {
            lines.push("<blockquote>Your don't have any closed positions yet!  Your total earnings will show here when you do.</blockquote>");
        }
        lines.push("");

        this.addNetPNLSummary(lines);
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, `:refresh: Refresh`, new CallbackData(MenuCode.ViewPNLHistory));
        this.insertButtonNextLine(options, `:back: Back`, new CallbackData(MenuCode.Main))
        return options;
    }
    private addHeader(lines : string[]) {
        lines.push(`${logoHack()}<u><b>PNL History</b></u>`);        
    }
    private addNetPNLSummary(lines : string[]) {
        lines.push(`<b>Total</b>: <code>${asTokenPriceDelta(this.menuData.netPNL)} SOL</code>`);
    }
    private addClosedPositionSummary(lines : string[], position : Position) {
        if (position.netPNL == null) {
            return;
        }
        const label = this.padRight(`${position.token.symbol}: `, 9);
        const pnlString = `${asTokenPriceDelta(position.netPNL)} SOL`;
        lines.push(`:bullet: Sale of <code>${label} ${pnlString}</code>`);
    }

    private padRight(text : string, length : number) : string {
        if (text.length < length) {
            return text + " ".repeat(length - text.length);
        }
        else {
            return text.slice(0, length);
        }
    }

    renderURLPreviewNormally(): boolean {
        return false;
    }
}