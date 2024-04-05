import { dClamp, dCompare, dDiv, dMult, dSub, fromNumber } from "../decimalized";
import { DecimalizedAmount, MATH_DECIMAL_PLACES, asPercentDeltaString, asPercentString, asTokenPrice, asTokenPriceDelta, dZero, toNumber } from "../decimalized/decimalized_amount";
import { PNL, PositionAndMaybePNL } from "../durable_objects/token_pair_position_tracker/model/position_and_PNL";
import { Position, PositionStatus } from "../positions";
import { CallbackButton } from "../telegram";
import { assertNever } from "../util";
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
        else if (this.menuData.position.status === PositionStatus.Open && !this.triggerConditionMet()) {

            const closePositionCallbackData = new CallbackData(MenuCode.ClosePositionManuallyAction, this.menuData.position.positionID);
            
            if (this.buyIsConfirmed()) {
                this.insertButtonNextLine(options, ":cancel: Stop Monitoring And Sell Now", closePositionCallbackData);
            }
            
            this.insertButtonNextLine(options, `:chart_down: ${this.menuData.position.triggerPercent}% Trigger`, new CallbackData(MenuCode.EditOpenPositionTriggerPercent, this.menuData.position.positionID));
            this.insertButtonNextLine(options, `:twisted_arrows: ${this.menuData.position.sellSlippagePercent}% Slippage`, new CallbackData(MenuCode.EditOpenPositionSellSlippagePercent, this.menuData.position.positionID));
            this.insertButtonNextLine(options, `:brain: ${this.menuData.position.sellAutoDoubleSlippage ? '': 'Do Not'} Auto-Double Slippage If Sell Fails :brain:`, new CallbackData(MenuCode.EditOpenPositionAutoDoubleSlippage, this.menuData.position.positionID));
        }

        const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.menuData.position.positionID);
        this.insertButtonNextLine(options, ":refresh: Refresh", refreshPositionCallbackData);
        this.insertButtonNextLine(options, ":back: Back", this.menuCallback(MenuCode.ListPositions));

        return options;
    }

    private statusEmoji() : string {
        const status = this.position().status;
        if (status === PositionStatus.Open && !this.position().buyConfirmed) {
            return ':hollow:';
        }
        else if (status === PositionStatus.Open && this.triggerConditionMet()) {
            return ':orange:';
        }
        else if (status === PositionStatus.Open) {
            return ':green:';
        }
        else if (status === PositionStatus.Closing) {
            return ':orange:';
        }
        else if (status === PositionStatus.Closed) {
            return ':red:'
        }
        else {
            assertNever(status);
        }
    }

    private headerLines() : string[] {

        // name and amount of position, and token address
        const statusEmoji = this.statusEmoji();
        const refreshNonce = Math.floor(Date.now() / 60000);
        const lines = [
            `${statusEmoji} <b>${asTokenPrice(this.position().tokenAmt)} of <a href="https://birdeye.so/token/${this.menuData.position.token.address}?chain=solana&v=5&nonce=${refreshNonce}">$${this.position().token.symbol}</a></b>`,
            ` (<code>${this.position().token.address}</code>)`
        ];

        lines.push(`<b><u>Status</u></b>:`)

        // whether or not is confirmed, or is confirming
        if (this.isOpen() && !this.buyIsConfirmed()) {
            lines.push(`:hollow: <b>WARNING: THIS PURCHASE HAS NOT BEEN CONFIRMED!</b>`);
            lines.push(`:bullet: We will retry confirming your purchase with Solana soon`)
        }
        else if (this.isOpen() && this.triggerConditionMet()) {
            lines.push(`:bullet: The position's trigger percent condition has been met! This position will be sold if the price remains below this level.`);
        }
        else if (this.isOpen()) {
            lines.push(`:bullet: This position is open and its price is being monitored to see if it falls ${this.position().triggerPercent.toFixed(1)}% below the peak.`)
        }
        else if (this.isClosing()) {
            lines.push(`:bullet: We are attempting to sell this position.`);
        }
        else if (this.isClosed()) {
            lines.push(`:bullet: This position is closed.`);
        }

        if (this.isClosing() && this.sellIsUnconfirmed()) {
            lines.push(`:bullet: We will be confirming the sale of this position in a moment.`);
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
        
        if (this.isPositionWithPNL() && !this.isClosingOrClosed() && !this.triggerConditionMet()) {
            const peakPriceComparison = this.lessThanPeakPrice() ? `${asPercentString(this.percentBelowPeak())} &lt;` : '=';
            lines.push(`:bullet: <b>Current Price</b>: ${asTokenPrice(this.currentPrice())} (${peakPriceComparison} Peak Price)`);
            lines.push(`:bullet: <b>Peak Price</b>: ${asTokenPrice(this.menuData.peakPrice)}`)
            lines.push(`:bullet: <b>Trigger Percent</b>: ${this.menuData.position.triggerPercent.toFixed(1)}%`)
            lines.push(`:bullet: <b>PNL</b>: ${asTokenPriceDelta(this.calcPNL())} (${asPercentDeltaString(this.pnlDeltaPct())})`);
        }

        if (this.buyIsConfirmed() && this.isCloseToBeingTriggered() && !this.isClosingOrClosed() && !this.triggerConditionMet() && this.buyIsConfirmed()) {
            lines.push(":eyes: This position is close to being triggered! :eyes:");
        }

        return lines;
    }

    private lessThanPeakPrice(this : { menuData : { PNL : PNL, position : Position }}) : boolean {
        return toNumber(this.menuData.PNL.fracBelowPeak) >= 1e-4;
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
        return [
            `Support Code: <i>${this.menuData.position.positionID}</i>`
        ];
    }

    private buyIsConfirmed() : boolean {
        return this.menuData.position.buyConfirmed;
    }

    private isOpen() : boolean {
        return this.menuData.position.status === PositionStatus.Open;
    }

    private isClosing() : boolean {
        return this.menuData.position.status === PositionStatus.Closing;
    }

    private isClosed() : boolean {
        return this.menuData.position.status === PositionStatus.Closed;
    }

    private sellIsUnconfirmed() : boolean {
        return this.menuData.position.sellConfirmed === false; // triple eq deliberate
    }

    private pnlDeltaPct(this : { menuData : PositionAndMaybePNL & { PNL : PNL } }) : DecimalizedAmount {
        return dMult(fromNumber(100), this.menuData.PNL.PNLfrac);
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

    private triggerConditionMet() {
        if (this.isPositionWithPNL()) {
            return dCompare(this.menuData.PNL.fracBelowPeak, fromNumber(this.menuData.position.triggerPercent / 100)) >= 0;
        }
        else {
            return false;
        }
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