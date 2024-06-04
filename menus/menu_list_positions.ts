import { dAdd, dCompare, dDiv, dMult, fromNumber, toFriendlyString } from "../decimalized";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, asPercentDeltaString, asPercentString, asTokenPrice, dZero, toNumber } from "../decimalized/decimalized_amount";
import { PNL, PositionAndMaybePNL } from "../durable_objects/token_pair_position_tracker/model/position_and_PNL";
import { Position, PositionStatus } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { MenuCapabilities, PaginatedMenu } from "./menu";
import { MenuCode } from "./menu_code";
import { PaginationOpts } from "./pagination";

export class MenuListPositions extends PaginatedMenu<PositionAndMaybePNL,{ items: PositionAndMaybePNL[], pageIndex: number }> implements MenuCapabilities {
    renderText(): string {
        const lines = [ `<b>Your Auto-Sell Positions</b>` ];
        const maybeTotalPNL = this.maybeCalcTotalPNL();
        if (maybeTotalPNL != null) {
            let pnlLine = `<b>Total Unrealized PnL</b> ${toFriendlyString(maybeTotalPNL, 4, { useSubscripts: false, addCommas: true, includePlusSign: true })} SOL`;
            const originalTotalValue = this.calcOriginalTotalValue();
            if (dCompare(originalTotalValue, dZero()) > 0) {
                const fracTotalPNL = dDiv(maybeTotalPNL, 
                    originalTotalValue, 
                    MATH_DECIMAL_PLACES) || dZero();
                const pctTotalPNL = dMult(fracTotalPNL, fromNumber(100));
                pnlLine += `| ${toFriendlyString(pctTotalPNL, 2, { useSubscripts: false, addCommas: false, includePlusSign: true })}%`;
            }
            lines.push(pnlLine);
        }
        return lines.join('\r\n');
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        
        for (const p of this.getItemsOnPage()) {
            const position = p.position;
            const positionLabel = this.makePositionLabel(p);
            const callbackData = new CallbackData(MenuCode.ViewOpenPosition, position.positionID);
            this.insertButtonNextLine(options, positionLabel, callbackData);
        }
        this.insertPaginationButtons(options, MenuCode.ListPositions);
        this.insertButtonNextLine(options, ':back: Back', this.menuCallback(MenuCode.TSLMainMenu));        
        this.insertButtonSameLine(options, ':refresh: Refresh', this.menuCallback(MenuCode.ListPositions))
        return options;
    }
    maybeCalcTotalPNL() : DecimalizedAmount|undefined {
        let totalPNL = dZero();
        for (const p of this.menuData.items) {
            if (p.PNL == null) {
                return;
            }
            totalPNL = dAdd(totalPNL, p.PNL.PNL);
        }
        return totalPNL;
    }
    calcOriginalTotalValue() : DecimalizedAmount {
        let totalOriginalValue = dZero();
        for (const p of this.menuData.items) {
            totalOriginalValue = dAdd(totalOriginalValue, p.position.vsTokenAmt);
        }
        return totalOriginalValue;
    }
    makePositionLabel(p : PositionAndMaybePNL) : string {
        const labelIcon = this.makePositionLabelIcon(p);
        const name = this.makePositionLabelName(p);
        const pnlIcon = this.makePositionLabelPNLIcon(p);
        const footnote = this.makePositionLabelFootnote(p);
        const peakDescription = this.makePeakDescription(p);
        return [labelIcon,name,pnlIcon,footnote,peakDescription].filter(x => (x||'') != '').join(" ");
    }

    makePositionLabelIcon(p : PositionAndMaybePNL) {
        if (p.PNL == null) {
            return ':purple:';
        }
        else {
            const position = p.position;
            // TODO: unify the many places that this code is written in this codebase.
            const triggerPercentMet = position.triggerPercent < (100 * toNumber(p.PNL.fracBelowPeak));
            if (!position.buyConfirmed) {
                return ':hollow:';
            }
            else if (triggerPercentMet || position.status === PositionStatus.Closing) {
                return ':orange:';
            }
            else if (position.status === PositionStatus.Open) {
                return ':green:';
            }            
            else if (position.status === PositionStatus.Closed) {
                return ':red:';
            }
        }
    }

    makePositionLabelName(p : PositionAndMaybePNL) : string {
        const position = p.position;
        return `${asTokenPrice(position.tokenAmt)} of $${position.token.symbol}`;
    }

    makePositionLabelPNLIcon(p : PositionAndMaybePNL) : string {
        if (p.PNL == null) {
            return '';
        }
        else {
            const currentPrice = p.PNL.currentPrice;
            const pricePctDelta = dMult(fromNumber(100),p.PNL.PNLfrac);
            return `(${asPercentDeltaString(pricePctDelta)})`;
        }
    }

    makePositionLabelFootnote(p : PositionAndMaybePNL) : string {
        const position = p.position;
        if (p.PNL == null) {
            return '(No price data)';
        }
        if (position.status === PositionStatus.Closing) {
            return '(Attempting sale)';
        }
        else if (position.status === PositionStatus.Closed) {
            return '(Closed)';
        }
        return '';
    }

    makePeakDescription(p : PositionAndMaybePNL) : string {
        if (this.hasPNL(p) && this.isOpen(p) && this.buyConfirmed(p) && !this.triggerConditionMet(p)) {
            const pctBelowPeak = dMult(fromNumber(100), (p.PNL.fracBelowPeak));
            if (toNumber(pctBelowPeak) <= 0.0) {
                return ' :mountain: At Peak Price!';
            }
            else {
                return ` ${asPercentString(pctBelowPeak)} Below Peak`
            }
        }
        else {
            return '';
        }
    }

    hasPNL(p : PositionAndMaybePNL) : p is PositionAndMaybePNL & { PNL : PNL } {
        return p.PNL != null;
    }

    isOpen(p : PositionAndMaybePNL) : p is PositionAndMaybePNL & { position : Position & { status: PositionStatus.Open }} {
        return p.position.status === PositionStatus.Open;
    }

    buyConfirmed(p : PositionAndMaybePNL) : p is PositionAndMaybePNL & { position : Position & { buyConfirmed : true }} {
        return p.position.buyConfirmed;
    }

    triggerConditionMet(p : PositionAndMaybePNL & { PNL : PNL }) {
        return p.position.triggerPercent <  (100 * toNumber(p.PNL.fracBelowPeak));
    }
    protected paginationOpts(): PaginationOpts {
        return {
            itemsPerPage: 10,
            numClickablePages: 4
        };
    }
}