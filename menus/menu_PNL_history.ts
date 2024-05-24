import { dAdd, dDiv, dMult } from "../decimalized";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, asPercentDeltaString, asTokenPrice, asTokenPriceDelta, dZero, fromNumber, toNumber } from "../decimalized/decimalized_amount";
import { Position } from "../positions";
import { CallbackButton, asChartEmoji } from "../telegram";
import { FormattedTable } from "../util/strings";
import { CallbackData } from "./callback_data";
import { logoHack } from "./logo_hack";
import { MenuCapabilities, PaginatedMenu } from "./menu";
import { MenuCode } from "./menu_code";
import { PaginationOpts } from "./pagination";

export class MenuPNLHistory extends PaginatedMenu<Position[],{ items : Position[][], netPNL : DecimalizedAmount, pageIndex : number }> implements MenuCapabilities {
    renderText(): string {

        const lines : string[] = [];

        this.addHeader(lines);
        this.addNetPNLSummary(lines, this.menuData.items.flatMap(x => x));
        lines.push("");
        
        const displayed = this.getItemsOnPage();
        for (const displayItem of displayed) {
            this.addPNLSummaryForToken(lines, displayItem);
        }
        
        return lines.join("\r\n");
    }

    protected paginationOpts(): PaginationOpts {
        return {
            itemsPerPage: 4,
            numClickablePages: 4
        }
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
        const heading = `<b><u>${pos.token.symbol}</u></b> ${asChartEmoji(toNumber(netPNL))} (${asPercentDeltaString(pnlPercentDelta)}) (${numPositions} closed positions)`;
        lines.push(heading);
        lines.push(`<code>${pos.token.address}</code>`);        
        const table = new FormattedTable([10], 'bulleted');
        table.addLine(`${asTokenPrice(totalInvested, true)}`, "SOL Invested");
        table.addLine(`${asTokenPrice(dAdd(totalInvested, netPNL), true)}`, "SOL Returned");
        table.addLine(`${asTokenPriceDelta(netPNL)}`, `Net SOL (${asPercentDeltaString(pnlPercentDelta)})`);
        table.appendTo(lines);
        lines.push("")
    }

    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        this.insertPaginationButtons(options, MenuCode.ViewPNLHistory);
        this.insertButtonNextLine(options, `:back: Back`, new CallbackData(MenuCode.Main));        
        this.insertButtonSameLine(options, `:refresh: Refresh`, new CallbackData(MenuCode.ViewPNLHistory));
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
    
    renderURLPreviewNormally(): boolean {
        return false;
    }
}