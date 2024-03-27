import { dAdd, dCompare, dDiv, dMult, fromNumber, toFriendlyString } from "../decimalized";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, dZero } from "../decimalized/decimalized_amount";
import { PositionAndMaybePNL } from "../durable_objects/token_pair_position_tracker/model/position_and_PNL";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuListPositions extends Menu<PositionAndMaybePNL[]> implements MenuCapabilities {
    renderText(): string {
        const lines = [ `<b>Your Open Positions</b>` ];
        const maybeTotalPNL = this.maybeCalcTotalPNL();
        if (maybeTotalPNL != null) {
            let pnlLine = `<b>Total Unrealized PNL</b> ${toFriendlyString(maybeTotalPNL, 4, false, true, true)} SOL`;
            const originalTotalValue = this.calcOriginalTotalValue();
            if (dCompare(originalTotalValue, dZero()) > 0) {
                const fracTotalPNL = dDiv(maybeTotalPNL, originalTotalValue, MATH_DECIMAL_PLACES);
                const pctTotalPNL = dMult(fracTotalPNL, fromNumber(100));
                pnlLine += `| ${toFriendlyString(pctTotalPNL, 2, false, false, true)}%`;
            }
            lines.push(pnlLine);
        }
        return lines.join('\r\n');
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();
        
        for (const p of this.menuData) {
            const position = p.position;
            const pnlPercent = p.PNL == null ? null : dMult(p.PNL.PNLfrac,fromNumber(100));
            const pnlPercentString = pnlPercent == null ? `` : `(${toFriendlyString(pnlPercent, 2, false, false, true)}%)`;
            const positionLabel = `${toFriendlyString(position.tokenAmt,2)} $${position.token.symbol} ${pnlPercentString}`;
            const callbackData = new CallbackData(MenuCode.ViewOpenPosition, position.positionID);
            this.insertButtonNextLine(options, positionLabel, callbackData);
        }
        this.insertBackToMainButtonOnNewLine(options);
        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
    maybeCalcTotalPNL() : DecimalizedAmount|undefined {
        let totalPNL = dZero();
        for (const p of this.menuData) {
            if (p.PNL == null) {
                return;
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
}