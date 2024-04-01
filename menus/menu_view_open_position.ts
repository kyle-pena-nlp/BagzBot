import { dClamp, dDiv, dMult, dSub, fromNumber } from "../decimalized";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, asPercentString, asTokenPrice, asTokenPriceDelta, dZero, toNumber } from "../decimalized/decimalized_amount";
import { PNL, PositionAndMaybePNL } from "../durable_objects/token_pair_position_tracker/model/position_and_PNL";
import { Position, PositionStatus } from "../positions";
import { CallbackButton } from "../telegram";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

type BrandNewPosition = { brandNewPosition : true, position : Position };

export class MenuViewOpenPosition extends Menu<PositionAndMaybePNL|BrandNewPosition> implements MenuCapabilities {
    renderText(): string {
        const lines = [];
        lines.push(...this.headerLines());
        lines.push("");
        lines.push(...this.bodyLines());
        lines.push("");
        lines.push(...this.footerLines());
        return lines.join("\r\n");
    }
    renderOptions(): CallbackButton[][] {

        const options = this.emptyMenu();

        if (this.isClosingOrClosed()) {
            // no-op
        }
        else if (this.menuData.position.status === PositionStatus.Open) {

            const closePositionCallbackData = new CallbackData(MenuCode.ClosePositionManuallyAction, this.menuData.position.positionID);
            
            if (this.buyIsConfirmed()) {
                this.insertButtonNextLine(options, ":stop: Stop Monitoring And Sell Now", closePositionCallbackData);
            }

            if (!this.buyIsConfirmed() && !this.buyIsConfirming()) {
                this.insertButtonNextLine(options, "Try confirming now...", new CallbackData(MenuCode.ManuallyConfirmBuy, this.menuData.position.positionID));
            }
            
            this.insertButtonNextLine(options, "Change Trigger Percent", new CallbackData(MenuCode.EditOpenPositionTriggerPercent, this.menuData.position.positionID));
            this.insertButtonNextLine(options, `:brain: ${this.menuData.position.sellAutoDoubleSlippage ? '': 'Do Not'} Auto-Double Slippage If Sell Fails :brain:`, new CallbackData(MenuCode.EditOpenPositionAutoDoubleSlippage, this.menuData.position.positionID));

            const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.menuData.position.positionID);
            this.insertButtonNextLine(options, ":refresh: Refresh", refreshPositionCallbackData);
        }

        this.insertButtonNextLine(options, "Back", this.menuCallback(MenuCode.ListPositions));

        return options;
    }

    private headerLines() : string[] {

        // name and amount of position, and token address
        const lines = [
            `<b>$${this.position().token.symbol}</b> (<code>${this.position().token.address}</code>)`,
        ];

        // whether or not is confirmed, or is confirming
        if (!this.buyIsConfirmed() && !this.buyIsConfirming()) {
            lines.push(`:stop: <b>WARNING: THIS PURCHASE HAS NOT BEEN CONFIRMED!</b>`);
            lines.push(`:bullet: We will retry confirming your purchase with Solana soon`)
        }
        else if (!this.buyIsConfirmed() && this.buyIsConfirming()) {
            lines.push(`:caution: <b>WE ARE CONFIRMING YOUR PURCHASE</b>`);
            lines.push(`:bullet: Refresh in a few moments for an update.`) 
        }            

        // brand new position - refresh again, dear user!
        if ('brandNewPosition' in this.menuData) {
            lines.push("This position is brand new! Refresh in a few moments to get more detailed information.");
            return lines;
        }

        // closed position.
        if (this.position().status === PositionStatus.Closed) {
            lines.push("This position has been closed.");
            return lines;
        }
    
        // closing position.
        
        if (this.isPositionWithPNL() && !this.isClosingOrClosed()) {
            lines.push(`:bullet: <b>Current Price</b>: ${asTokenPrice(this.currentPrice())} (${asPercentString(this.percentBelowPeak())} &lt; Peak Price)`);
            lines.push(`:bullet: <b>Peak Price</b>: ${asTokenPrice(this.menuData.peakPrice)}`)
            lines.push(`:bullet: <b>Trigger Percent</b>: ${this.menuData.position.triggerPercent.toFixed(1)}%`)
            lines.push(`:bullet: <b>PNL</b>: ${asTokenPriceDelta(this.calcPNL())}`);
        }

        if (this.isCloseToBeingTriggered()) {
            lines.push(":eyes: This position is closed to being triggered! :eyes:");
        }

        return lines;
    }

    private position() : Position {
        return this.menuData.position;
    }

    private pricePercentDelta(this : { menuData : { PNL : PNL, position : Position }}) : DecimalizedAmount {
        const priceDelta = dSub(this.menuData.PNL.currentPrice, this.menuData.position.fillPrice);
        return dDiv(priceDelta, this.menuData.position.fillPrice, MATH_DECIMAL_PLACES)||dZero();
    }

    private calcPNL(this : { menuData : { PNL : PNL, position : Position }}) : DecimalizedAmount {
        return this.menuData.PNL.PNL;
    }

    private percentBelowPeak(this : { menuData : { PNL : PNL }}) : DecimalizedAmount {
        return dClamp(dMult(fromNumber(100),this.menuData.PNL.fracBelowPeak), fromNumber(0), undefined);
    }

    private bodyLines() : string[] {
        return [];
    }

    private footerLines() : string[] {
        return [];
    }

    private buyIsConfirmed() : boolean {
        return this.menuData.position.buyConfirmed;
    }

    private buyIsConfirming() : boolean {
        return this.menuData.position.isConfirmingBuy;
    }

    private isBrandNewPosition() : this is { menuData: BrandNewPosition } {
        return 'brandNewPosition' in this.menuData;
    }

    private isPositionAndMaybePNL() : this is { menuData : PositionAndMaybePNL } {
        return 'PNL' in this.menuData;
    }

    private isPositionWithNoPNL() : this is { menuData : PositionAndMaybePNL & { PNL : undefined } } {
        return this.isPositionAndMaybePNL() && this.menuData.PNL == null;
    }

    private isPositionWithPNL() : this is { menuData : PositionAndMaybePNL & { PNL : PNL } } {
        return this.isPositionAndMaybePNL() && this.menuData.PNL != null;
    }

    private isClosingOrClosed() : this is { menuData : { position : { status : PositionStatus.Closing|PositionStatus.Closed }}} {
        const status = this.menuData.position.status;
        return status === PositionStatus.Closing || status === PositionStatus.Closed;
    }

    private isCloseToBeingTriggered() {
        if (!this.isPositionWithPNL()) {
            return false;
        }
        if (this.isClosingOrClosed()) {
            return false;
        }
        const triggerPercent = this.menuData.position.triggerPercent;
        const pctBelowPeak = dMult(fromNumber(100), this.menuData.PNL.fracBelowPeak);
        const willTriggerSoon = (triggerPercent - toNumber(pctBelowPeak)) < 1.0;
        return willTriggerSoon;
    }

    private currentPrice(this: { menuData : { PNL : PNL }}) : DecimalizedAmount {
        return this.menuData.PNL.currentPrice;
    }
}