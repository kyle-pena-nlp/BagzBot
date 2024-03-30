import { dCompare, dMult, fromNumber, toFriendlyString } from "../decimalized";
import { dZero, toNumber } from "../decimalized/decimalized_amount";
import { PositionAndMaybePNL } from "../durable_objects/token_pair_position_tracker/model/position_and_PNL";
import { Position, PositionStatus } from "../positions";
import { CallbackButton } from "../telegram";
import { interpretPct } from "../telegram/emojis";
import { assertNever } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class MenuViewOpenPosition extends Menu<PositionAndMaybePNL|{ brandNewPosition : true, position : Position }> implements MenuCapabilities {
    renderText(): string {
        const position = this.menuData.position;
        const invisibleLink = ``;//`<a href="${this.menuData.position.token.logoURI}">\u200B</a>`
        const lines = [
            `<b>${toFriendlyString(position.tokenAmt,4)} $${position.token.symbol}</b> ${invisibleLink}`,
            ``
        ];
        if ('brandNewPosition' in this.menuData) {
            lines.push("This position is brand new! Refresh in a few moments to get more detailed information.");
            return lines.join("\r\n");
        }

        if (position.status === PositionStatus.Closed) {
            lines.push("This position has been closed.");
            return lines.join("\r\n");
        }

        if (this.menuData.PNL != null) {
            lines.push(`:bullet: <b>Current Price</b>: ${toFriendlyString(this.menuData.PNL.currentPrice,4)}`)
            lines.push(`:bullet: <b>Peak Price</b>: ${toFriendlyString(this.menuData.peakPrice,4)} :mountain:`)
            const pctBelowPeak = dMult(fromNumber(100), this.menuData.PNL.fracBelowPeak);
            const isBelowPeak = dCompare(pctBelowPeak, dZero()) > 0;
            if (isBelowPeak) {
                const pctBelowPeakString = toFriendlyString(pctBelowPeak, 4, { useSubscripts: false, maxDecimalPlaces: 1 });
                lines.push(`:bullet: <b>% Below Peak Price</b>: ${pctBelowPeakString}% :chart_down:`);
            }
            else {
                lines.push(`:bullet: Currently at peak price! :sparkle:`);
            }
            const triggerPercent = this.menuData.position.triggerPercent;
            lines.push(`:bullet: <b>Trigger Percent</b>: ${triggerPercent.toFixed(1)}%`);
            const isTriggered = toNumber(pctBelowPeak) > triggerPercent;
            const willTriggerSoon = (triggerPercent - toNumber(pctBelowPeak)) < 1.0;
            if (isTriggered) {
                lines.push(`This position's trigger condition has been met, and is about to be sold!`);
            }
            else if (willTriggerSoon) {
                lines.push(`This position is close to being triggered :eyes:`);
            }
            const currentPNLString = toFriendlyString(this.menuData.PNL.PNL, 4, { useSubscripts: false, maxDecimalPlaces: 4 });
            const pnlPct = dMult(fromNumber(100), this.menuData.PNL.PNLfrac);
            const currentPNLPctString = toFriendlyString(pnlPct, 4, { useSubscripts: true });
            const currentPNLEmoji = interpretPct(toNumber(pnlPct));
            lines.push(`:bullet: <b>Current PNL</b> ${currentPNLString} SOL (${currentPNLPctString}% ${currentPNLEmoji})`);
        }

        if (position.status === PositionStatus.Closing) {
            lines.push("THE TRIGGER CONDITION HAS BEEN MET! The position is being sold.");
        }

        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {
        const options = this.emptyMenu();

        if (this.menuData.position.status === PositionStatus.Closing) {
            // no-op
        }
        else if (this.menuData.position.status === PositionStatus.Closed) {
            // no-op
        }
        else if (this.menuData.position.status === PositionStatus.Open) {
            const closePositionCallbackData = new CallbackData(MenuCode.ClosePositionManuallyAction, this.menuData.position.positionID);
            this.insertButtonNextLine(options, ":stop: Stop Monitoring And Sell", closePositionCallbackData);
            
            this.insertButtonNextLine(options, "Change Trigger Percent", new CallbackData(MenuCode.EditOpenPositionTriggerPercent, this.menuData.position.positionID));

            const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.menuData.position.positionID);
            this.insertButtonNextLine(options, ":refresh: Refresh", refreshPositionCallbackData);
        }
        else {
            assertNever(this.menuData.position.status);
        }

        this.insertButtonNextLine(options, "Back", this.menuCallback(MenuCode.ListPositions));

        return options;
    }
    parseMode(): "HTML" | "MarkdownV2" {
        return 'HTML';
    }
    renderURLPreviewNormally(): boolean {
        return true;
    }
    
}