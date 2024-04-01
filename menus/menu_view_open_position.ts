import { dCompare, dDiv, dMult, dSub, fromNumber, toFriendlyString } from "../decimalized";
import { MATH_DECIMAL_PLACES, dZero, toNumber } from "../decimalized/decimalized_amount";
import { PositionAndMaybePNL } from "../durable_objects/token_pair_position_tracker/model/position_and_PNL";
import { Position, PositionStatus } from "../positions";
import { CallbackButton } from "../telegram";
import { interpretPct, interpretPNL as interpretSignedSOLAmount } from "../telegram/emojis";
import { assertNever } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

const DEBUGGING = false;

export class MenuViewOpenPosition extends Menu<PositionAndMaybePNL|{ brandNewPosition : true, position : Position }> implements MenuCapabilities {
    renderText(): string {
        const position = this.menuData.position;
        const invisibleLink = ``;//`<a href="${this.menuData.position.token.logoURI}">\u200B</a>`
        const lines = [
            `<b>${toFriendlyString(position.tokenAmt,4)} $${position.token.symbol}</b> ${invisibleLink}`,
            `<code>${position.token.address}</code>`
        ];

        const buyIsConfirmed = this.menuData.position.buyConfirmed;

        if (!buyIsConfirmed) {
            lines.push(`:stop: <b>THIS PURCHASE HAS NOT BEEN CONFIRMED!</b>`);
            lines.push(`:bullet: We will retry confirming your purchase with Solana soon`)
        }            

        lines.push("");

        if ('brandNewPosition' in this.menuData) {
            lines.push("This position is brand new! Refresh in a few moments to get more detailed information.");
            return lines.join("\r\n");
        }

        if (position.status === PositionStatus.Closed) {
            lines.push("This position has been closed.");
            return lines.join("\r\n");
        }
    
        if (position.status === PositionStatus.Closing) {
            lines.push("THE TRIGGER CONDITION HAS BEEN MET! The position is being sold.");
            return lines.join('\r\n');
        }

        if (this.menuData.PNL != null) {

            // peak and current price
            lines.push("<b>Price Peak Information</b>")
            lines.push(`:bullet: <b>Current Price</b>: ${toFriendlyString(this.menuData.PNL.currentPrice,4)}`)
            lines.push(`:bullet: <b>Peak Price</b>: ${toFriendlyString(this.menuData.peakPrice,4)} :mountain:`)

            // compare to peak price
            const pctBelowPeak = dMult(fromNumber(100), this.menuData.PNL.fracBelowPeak);
            const isBelowPeak = dCompare(pctBelowPeak, dZero()) > 0;
            if (isBelowPeak) {
                const pctBelowPeakString = toFriendlyString(pctBelowPeak, 4, { useSubscripts: false, maxDecimalPlaces: 1 });
                lines.push(`:bullet: <b>% Below Peak Price</b>: ${pctBelowPeakString}% :chart_down:`);
            }
            else {
                lines.push(`:bullet: Currently at peak price! :mountain: :sparkle:`);
            }

            lines.push("");
            
            // describe trigger percent
            const triggerPercent = this.menuData.position.triggerPercent;
            lines.push("<b>Percent-Below-Peak Trigger</b>")
            lines.push(`:bullet: <b>Your Trigger Percent</b>: ${triggerPercent.toFixed(1)}%`);
            const isTriggered = toNumber(pctBelowPeak) > triggerPercent;
            const willTriggerSoon = (triggerPercent - toNumber(pctBelowPeak)) < 1.0;
            if (isTriggered && buyIsConfirmed) {
                lines.push(`:bullet: This position's trigger condition has been met, and is about to be sold!`);
            }
            else if (willTriggerSoon) {
                lines.push(`:bullet: :eyes: This position is close to being triggered :eyes:`);
            }
            else {
                lines.push(`:bullet: <b>Current Percent Below Peak</b>: ${toFriendlyString(pctBelowPeak, 4, { useSubscripts: false, maxDecimalPlaces: 1})}%`)
            }

            lines.push("");

            const fillPriceString = toFriendlyString(this.menuData.position.fillPrice, 4);
            const currentPriceString = toFriendlyString(this.menuData.PNL.currentPrice, 4);
            const priceDelta = dSub(this.menuData.PNL.currentPrice, this.menuData.position.fillPrice);
            const priceDeltaString = toFriendlyString(priceDelta, 4, { includePlusSign: true });
            const priceDeltaEmoji = interpretPct(toNumber(priceDelta))
            lines.push("<b>Price</b>")
            lines.push(`:bullet: <b>Fill Price</b>: ${fillPriceString} SOL`);
            lines.push(`:bullet: <b>Current Price</b>: ${currentPriceString} SOL`);
            lines.push(`:bullet: <b>Price Change</b>: ${priceDeltaString}`);

            const fillValue = this.menuData.position.vsTokenAmt;
            const fillValueEmoji = interpretSignedSOLAmount(toNumber(fillValue));
            const fillValueString = toFriendlyString(fillValue, 4);
            const currentValue = this.menuData.PNL.currentValue;
            const currentValueString = toFriendlyString(currentValue, 4);
            const currentValueEmoji = interpretSignedSOLAmount(toNumber(currentValue));
            const valueDelta = dSub(this.menuData.PNL.currentValue, this.menuData.position.vsTokenAmt);
            const valueDeltaString = toFriendlyString(valueDelta, 4, { includePlusSign: true });
            const valueDeltaEmoji = interpretSignedSOLAmount(toNumber(valueDelta));
            const valuePercentChange = dMult(fromNumber(100),dDiv(valueDelta, fillValue, MATH_DECIMAL_PLACES)||dZero());
            const valuePercentChangeEmoji = interpretPct(toNumber(valuePercentChange));
            const valuePercentChangeString = toFriendlyString(valuePercentChange, 4, { useSubscripts : false, includePlusSign: true, maxDecimalPlaces: 1 })
            lines.push("");
            lines.push("<b>Value</b>")
            lines.push(`:bullet: <b>Fill Value</b>: ${fillValueString} SOL ${fillValueEmoji}`);
            lines.push(`:bullet: <b>Current Value</b>: ${currentValueString} SOL ${currentValueEmoji}`);
            lines.push(`:bullet: <b>Change In Value</b>: ${valueDeltaString} SOL ${valueDeltaEmoji} (${valuePercentChangeString}%) ${valuePercentChangeEmoji}`)
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
            
            if (this.menuData.position.buyConfirmed) {
                this.insertButtonNextLine(options, ":stop: Stop Monitoring And Sell Now", closePositionCallbackData);
            }
            
            this.insertButtonNextLine(options, "Change Trigger Percent", new CallbackData(MenuCode.EditOpenPositionTriggerPercent, this.menuData.position.positionID));
            this.insertButtonNextLine(options, `:brain: ${this.menuData.position.sellAutoDoubleSlippage ? '': 'Do Not'} Auto-Double Slippage If Sell Fails :brain:`, new CallbackData(MenuCode.EditOpenPositionAutoDoubleSlippage, this.menuData.position.positionID));

            const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.menuData.position.positionID);
            this.insertButtonNextLine(options, ":refresh: Refresh", refreshPositionCallbackData);
        }
        else {
            assertNever(this.menuData.position.status);
        }

        this.insertButtonNextLine(options, "Back", this.menuCallback(MenuCode.ListPositions));

        return options;
    }
}