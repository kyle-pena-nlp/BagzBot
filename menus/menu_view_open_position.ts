import { dClamp, dCompare, dMult, fromNumber } from "../decimalized";
import { DecimalizedAmount, asPercentDeltaString, asPercentString, asTokenPrice, asTokenPriceDelta, toNumber } from "../decimalized/decimalized_amount";
import { PNL, PositionAndMaybePNL } from "../durable_objects/token_pair_position_tracker/model/position_and_PNL";
import { allowChooseAutoDoubleSlippage, allowChoosePriorityFees } from "../env";
import { Position, PositionStatus, describePriorityFee } from "../positions";
import { CallbackButton } from "../telegram";
import { assertNever } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

type BrandNewPosition = { brandNewPosition : true, position : Position };
type MenuData = { data: (PositionAndMaybePNL|BrandNewPosition) };
type ThisType = { menuData : MenuData }
type ThisTypeMaybeHasPNL = ThisType & { menuData: { data: PositionAndMaybePNL } };
type ThisTypeHasPNL = ThisType & { menuData: { data : PositionAndMaybePNL & { PNL : PNL }  } };
type ThisTypeHasNoPNL = ThisType & { menuData: { data : PositionAndMaybePNL & { PNL : undefined } } };
type ThisTypeIsBrandNewPosition = ThisType & { menuData: { data : BrandNewPosition } };
type ThisTypeIsClosingOrClosedPosition = ThisType & { menuData : { data : { position : { status : PositionStatus.Closing | PositionStatus.Closed } } } }

export class MenuViewOpenPosition extends Menu<MenuData> implements MenuCapabilities {
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
        else if (this.position().status === PositionStatus.Open && !this.triggerConditionMet()) {

            const closePositionCallbackData = new CallbackData(MenuCode.ClosePositionManuallyAction, this.position().positionID);
            
            if (this.buyIsConfirmed()) {
                this.insertButtonNextLine(options, ":cancel: Stop Monitoring And Sell Now", closePositionCallbackData);
            }
            
            this.insertButtonNextLine(options, `:chart_down: ${this.position().triggerPercent}% Trigger`, new CallbackData(MenuCode.EditOpenPositionTriggerPercent, this.position().positionID));
            this.insertButtonSameLine(options, `:twisted_arrows: ${this.position().sellSlippagePercent}% Slippage`, new CallbackData(MenuCode.EditOpenPositionSellSlippagePercent, this.position().positionID));

            // this will simplify when i strip out these feature flags
            const nextLine = options.length + 1;
            if (allowChoosePriorityFees(this.env)) {
                this.insertButton(options, `${describePriorityFee(this.position().sellPriorityFeeAutoMultiplier, this.env)}`, new CallbackData(MenuCode.EditOpenPositionPriorityFee, this.position().positionID), nextLine);
            }
            if (allowChooseAutoDoubleSlippage(this.env)) {
                this.insertButton(options, `${this.position().sellAutoDoubleSlippage ? '': 'Do Not'} Auto-Double Slippage`, new CallbackData(MenuCode.EditOpenPositionAutoDoubleSlippage, this.position().positionID), nextLine);
            }
        }

        if (this.canBeDeactivated()) {
            this.insertButtonNextLine(options, ':deactivated: Deactivate Position :deactivated:', new CallbackData(MenuCode.DeactivatePosition, this.position().positionID));
        }

        const refreshPositionCallbackData = new CallbackData(MenuCode.ViewOpenPosition, this.position().positionID);
        this.insertButtonNextLine(options, ":back: Back", this.menuCallback(MenuCode.ListPositions));
        this.insertButtonSameLine(options, ":refresh: Refresh", refreshPositionCallbackData);
        this.insertButtonSameLine(options, "Close", this.menuCallback(MenuCode.Close));

        return options;
    }

    private statusEmoji() : string {
        const status = this.position().status;
        if (this.isPositionWithNoPNL()) {
            return ':purple:';
        }
        else if (status === PositionStatus.Open && !this.position().buyConfirmed) {
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
        const lines = [
            `${statusEmoji} <u><b>Your Auto-Sell Position</b></u> (<b>${asTokenPrice(this.position().tokenAmt)} of $${this.position().token.symbol}</b>)`,
            ` (<code>${this.position().token.address}</code>)`,
            ""
        ];

        if (this.isPositionWithNoPNL()) {
            lines.push(`<i>We had trouble retrieving price data on $${this.position().token.symbol}.</i>`);
            return lines;
        }         


        lines.push("<code><u><b>Note</b>: All price tracking is in SOL</u></code>")
        lines.push("");

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
            lines.push(`:bullet: We will be confirming the sale of this position within a few minutes.`);
        }

        lines.push("");

        // brand new position - refresh again, dear user!
        if (this.isBrandNewPosition()) {
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
            
            lines.push("<u><b>Price Movement</b></u>:");
            //lines.push(`:bullet: <code><b>Fill Price</b>:      </code>${asTokenPrice(this.position().fillPrice)} SOL`);
            lines.push(`:bullet: <code><b>Current Price</b>:   </code>${asTokenPrice(this.currentPrice())} SOL (${peakPriceComparison} Peak Price)`);
            lines.push(`:bullet: <code><b>Peak Price</b>:      </code>${asTokenPrice(this.menuData.data.peakPrice)} SOL`)
            //lines.push(`:bullet: <code><b>Trigger Percent</b>: </code>${this.position().triggerPercent.toFixed(1)}%`)
            lines.push(`:bullet: <code><b>Profit</b>:          </code>${asTokenPriceDelta(this.PNL().PNL)} SOL (${asPercentDeltaString(this.pnlDeltaPct())})`);
        }

        if (this.buyIsConfirmed() && this.isCloseToBeingTriggered() && !this.isClosingOrClosed() && !this.triggerConditionMet()) {
            lines.push("");
            lines.push(":eyes: This position is close to being triggered! :eyes:");
        }

        return lines;
    }

    private isBrandNewPosition() : this is this & ThisTypeIsBrandNewPosition {
        return 'brandNewPosition' in this.menuData.data;
    }

    private isPositionAndMaybePNL() : this is this & ThisTypeMaybeHasPNL {
        return 'PNL' in this.menuData.data;
    }

    private isPositionWithPNL() : this is this & ThisTypeHasPNL {
        return this.isPositionAndMaybePNL() && this.menuData.data.PNL != null;
    }

    private isPositionWithNoPNL() : this is this & ThisTypeHasNoPNL {
        return this.isPositionAndMaybePNL() && this.menuData.data.PNL == null;
    }

    private isClosingOrClosed() : this is this & ThisTypeIsClosingOrClosedPosition {
        const status = this.position().status;
        return (status === PositionStatus.Closing) || (status === PositionStatus.Closed);
    }

    private lessThanPeakPrice(this : this & ThisTypeHasPNL) : boolean {
        return toNumber(this.PNL().fracBelowPeak) >= 1e-4;
    }

    private position() : Position {
        return this.menuData.data.position;
    }

    private PNL(this : this & ThisTypeHasPNL) : PNL {
        return this.menuData.data.PNL;
    }

    private percentBelowPeak(this : this & ThisTypeHasPNL) : DecimalizedAmount {
        return dClamp(dMult(fromNumber(100),this.PNL().fracBelowPeak), fromNumber(0), undefined);
    }

    private bodyLines() : string[] {
        return [];
    }

    private footerLines() : string[] {
        return [
            `Support Code: <i><code>${this.position().positionID}</code></i>`
        ];
    }

    private buyIsConfirmed() : boolean {
        return this.position().buyConfirmed;
    }

    private canBeDeactivated() : boolean {
        return this.buyIsConfirmed() && this.isOpen() &&  !this.triggerConditionMet();
    }

    private isOpen() : boolean {
        return this.position().status === PositionStatus.Open;
    }

    private isClosing() : boolean {
        return this.position().status === PositionStatus.Closing;
    }

    private isClosed() : boolean {
        return this.position().status === PositionStatus.Closed;
    }

    private sellIsUnconfirmed() : boolean {
        return this.position().sellConfirmed === false; // triple eq deliberate
    }

    private pnlDeltaPct(this : this & ThisTypeHasPNL) : DecimalizedAmount {
        return dMult(fromNumber(100), this.PNL().PNLfrac);
    }

 

    private triggerConditionMet() {
        if (this.isPositionWithPNL()) {
            return dCompare(this.PNL().fracBelowPeak, fromNumber(this.position().triggerPercent / 100)) >= 0;
        }
        else {
            return false;
        }
    }



    private isCloseToBeingTriggered() {
        if (!this.isPositionWithPNL()) {
            return false;
        }
        if (this.isClosingOrClosed()) {
            return false;
        }
        const triggerPercent = this.position().triggerPercent;
        const pctBelowPeak = dMult(fromNumber(100), this.PNL().fracBelowPeak);
        const willTriggerSoon = (triggerPercent - toNumber(pctBelowPeak)) < 1.0;
        return willTriggerSoon;
    }

    private currentPrice(this: this & ThisTypeHasPNL) : DecimalizedAmount {
        return this.menuData.data.PNL.currentPrice;
    }
}