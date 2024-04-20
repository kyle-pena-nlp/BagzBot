import { dAdd, dDiv, dMult } from "../decimalized";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, asPercentDeltaString, asTokenPrice, asTokenPriceDelta, dZero, fromNumber, toNumber } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton, asChartEmoji } from "../telegram";
import { groupIntoMap } from "../util";
import { FormattedTable, padRight } from "../util/strings";
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
        for (const [_,closedPositionsForToken] of groupedClosedPositions) {
            this.addPNLSummaryForToken(lines, closedPositionsForToken);
        }

        this.addNetPNLSummary(lines, closedPositions);
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
        const heading = `<b><u>${pos.token.symbol}</u></b> ${asChartEmoji(toNumber(netPNL))} (${asPercentDeltaString(pnlPercentDelta)})`;
        lines.push(`<code>${pos.token.address}</code>`);
        lines.push(heading);
        const table = new FormattedTable([10], 'bulleted');
        table.addLine(`${asTokenPrice(totalInvested, true)}`, "SOL Invested");
        table.addLine(`${asTokenPriceDelta(netPNL)}`, `Net SOL (${asPercentDeltaString(pnlPercentDelta)})`);
        table.appendTo(lines);
        lines.push("")
    }

    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertButtonNextLine(options, `:refresh: Refresh`, new CallbackData(MenuCode.ViewPNLHistory));
        this.insertButtonSameLine(options, `:back: Back`, new CallbackData(MenuCode.Main));
        this.insertButtonSameLine(options, `Close`, new CallbackData(MenuCode.Close));
        return options;
    }

    private addHeader(lines : string[]) {
        lines.push(`${logoHack()}<u><b>PnL Summary</b></u>`);        
    }

    private addNetPNLSummary(lines : string[], closedPositions : Position[]) {
        let totalInvested = dZero();
        let netPNL = dZero();
        for (const closedPosition of closedPositions) {
            totalInvested = dAdd(totalInvested, closedPosition.vsTokenAmt);
            netPNL = dAdd(netPNL, closedPosition.netPNL||dZero());
        }
        const percentPNL = dMult(fromNumber(100), dDiv(netPNL, totalInvested, MATH_DECIMAL_PLACES)||dZero());
        lines.push(`<b>Bottom Line</b>: <code>${asTokenPriceDelta(this.menuData.netPNL)} SOL (${asPercentDeltaString(percentPNL)})</code>`);
    }
    
    private addClosedPositionSummary(lines : string[], position : Position) {
        if (position.netPNL == null) {
            return;
        }
        const label = padRight(`${position.token.symbol}: `, 9);
        const pnlString = `${asTokenPriceDelta(position.netPNL)} SOL`;
        lines.push(`:bullet: Sale of <code>${label} ${pnlString}</code>`);
    }

    renderURLPreviewNormally(): boolean {
        return false;
    }
}