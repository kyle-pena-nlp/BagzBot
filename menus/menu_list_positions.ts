import { dAdd, dCompare, dDiv, dMult, fromNumber, toFriendlyString } from "../decimalized";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, asPercentDeltaString, asTokenPrice, dZero, toNumber } from "../decimalized/decimalized_amount";
import { PositionAndMaybePNL } from "../durable_objects/token_pair_position_tracker/model/position_and_PNL";
import { Position, PositionStatus } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuListPositions extends Menu<PositionAndMaybePNL[]> implements MenuCapabilities {
    renderText(): string {
        const lines = [ `<b>Your Open Positions</b>` ];
        const maybeTotalPNL = this.maybeCalcTotalPNL();
        if (maybeTotalPNL != null) {
            let pnlLine = `<b>Total Unrealized PNL</b> ${toFriendlyString(maybeTotalPNL, 4, { useSubscripts: false, addCommas: true, includePlusSign: true })} SOL`;
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
        
        for (const p of this.menuData) {
            const position = p.position;
            if (!this.shouldBeListed(position)) {
                continue;
            }
            const positionLabel = this.makePositionLabel(p);
            const callbackData = new CallbackData(MenuCode.ViewOpenPosition, position.positionID);
            this.insertButtonNextLine(options, positionLabel, callbackData);
        }
        this.insertButtonNextLine(options, ':refresh: Refresh', this.menuCallback(MenuCode.ListPositions))
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
    maybeCalcTotalPNL() : DecimalizedAmount|undefined {
        let totalPNL = dZero();
        for (const p of this.menuData) {
            if (p.PNL == null) {
                return;
            }
            if (!this.shouldBeListed(p.position)) {
                continue;
            }
            totalPNL = dAdd(totalPNL, p.PNL.PNL);
        }
        return totalPNL;
    }
    calcOriginalTotalValue() : DecimalizedAmount {
        let totalOriginalValue = dZero();
        for (const p of this.menuData) {
            totalOriginalValue = dAdd(totalOriginalValue, p.position.vsTokenAmt);
        }
        return totalOriginalValue;
    }
    makePositionLabel(p : PositionAndMaybePNL) : string {
        const labelIcon = this.makePositionLabelIcon(p);
        const name = this.makePositionLabelName(p);
        const pnlIcon = this.makePositionLabelPNLIcon(p);
        const footnote = this.makePositionLabelFootnote(p);
        return [labelIcon,name,pnlIcon,footnote].filter(x => (x||'') != '').join(" ");
    }

    makePositionLabelIcon(p : PositionAndMaybePNL) {
        if (p.PNL == null) {
            return ':red:';
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
        if (position.status === PositionStatus.Closing) {
            return '(Attempting sale)';
        }
        else if (position.status === PositionStatus.Closed) {
            return '(Closed)';
        }
        return '';
    }

    shouldBeListed(position : Position) : boolean {
        return position.status === PositionStatus.Open && position.buyConfirmed;
    }
}