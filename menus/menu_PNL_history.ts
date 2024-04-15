import { dAdd, dDiv, dMult } from "../decimalized";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, asPercentDeltaString, asTokenPriceDelta, dZero, fromNumber } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton } from "../telegram";
import { groupIntoMap } from "../util";
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
        
        const groupedClosedPositions = groupIntoMap(closedPositions, pos => pos.token.address);
        for (const [address,closedPositionsForToken] of groupedClosedPositions) {
            this.addPNLSummaryForToken(lines, closedPositionsForToken);
        }
        
        /*for (const pos of closedPositions) {
            this.addClosedPositionSummary(lines, pos);
        }
        if (this.menuData.closedPositions.length == 0) {
            lines.push("<blockquote>Your don't have any closed positions yet!  Your total earnings will show here when you do.</blockquote>");
        }
        lines.push("");*/

        this.addNetPNLSummary(lines);
        return lines.join("\r\n");
    }

    addPNLSummaryForToken(lines : string[], closedPositionsForToken : Position[]) {
        let netPNL = dZero();
        let totalInvested = dZero();
        let numPositions = 0;
        for (const closedPosition of closedPositionsForToken) {
            const pnl = closedPosition.netPNL;
            if (pnl != null) {
                netPNL = dAdd(netPNL, pnl);
                totalInvested = dAdd(totalInvested, closedPosition.vsTokenAmt);
                numPositions += 1;
            }
        }
        const pos = closedPositionsForToken[0];
        const pnlPercentDelta = dMult(fromNumber(100), dDiv(netPNL, totalInvested, MATH_DECIMAL_PLACES)||dZero());
        lines.push(`<b><u>$${pos.token.symbol}:</u></b>`);
        lines.push(`:bullet: ${numPositions} closed position` + ((numPositions > 1) ? 's' : '') );
        lines.push(`:bullet: ${asTokenPriceDelta(netPNL)} SOL`);
        lines.push(`:bullet: ${asPercentDeltaString(pnlPercentDelta)} PNL`);
        lines.push("");
        //lines.push(summaryLine);
    }

    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, `:refresh: Refresh`, new CallbackData(MenuCode.ViewPNLHistory));
        this.insertButtonNextLine(options, `:back: Back`, new CallbackData(MenuCode.Main))
        return options;
    }
    private addHeader(lines : string[]) {
        lines.push(`${logoHack()}<u><b>PNL Summary</b></u>`);        
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