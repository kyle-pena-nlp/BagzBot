import { DecimalizedAmount } from "../../../decimalized";
import { logDebug, logError } from "../../../logging";
import { Position, PositionStatus } from "../../../positions";
import { MapWithStorage } from "../../../util";
import { PositionAndMaybePNL } from "../model/position_and_PNL";
import { PeakPricePositionTracker } from "./peak_price_tracker";

export interface ActionsToTake {
    positionsToClose : Position[]
    buysToConfirm : Position[]
    sellsToConfirm : Position[]
}

// This class is really the heart of the whole application.
// It tracks prices, and automatically dispatches requests to update positions
// Point being, you can screw the whole app by messing this one up.
export class TokenPairPositionTracker {

    // special-purpose datastructure for tracking peak prices
    pricePeaks : PeakPricePositionTracker = new PeakPricePositionTracker("pricePeaks");

    // positions confirmed as closed - may be resurrected under unusual circumstances
    closedPositions : MapWithStorage<Position> = new MapWithStorage<Position>("closedPositions");

    constructor() {
    }

    clearAllPositions() {
        this.pricePeaks.clearAllPositions();
    }

    listClosedPositionsForUser(telegramUserID : number) : Position[] {
        const result : Position[] = [];
        for (const closedPosition of this.closedPositions.values()) {
            result.push(closedPosition);
        }
        return result;
    }

    // handy for debugging but is expensive.
    countPositions() : number {
        return this.pricePeaks.countPositions();
    }

    any() : boolean {
        return  this.pricePeaks.any();
    }

    getPositionAndMaybePNL(positionID : string, currentPrice : DecimalizedAmount|null) : PositionAndMaybePNL|undefined {
        return this.pricePeaks.getPositionAndMaybePNL(positionID, currentPrice);
    }

    getPosition(positionID : string) : Position|undefined {
        const result = this.pricePeaks.getPosition(positionID);
        return result;
    }

    listByUser(userID : number, currentPrice : DecimalizedAmount|null) : PositionAndMaybePNL[] {
        return this.pricePeaks.listByUser(userID, currentPrice);
    }

    updatePosition(position : Position) : boolean {
        return this.pricePeaks.updatePosition(position);
    }

    insertPosition(position : Position) : boolean {
        return this.pricePeaks.insertPosition(position);
    }

    updateSlippage(positionID : string, sellSlippagePercent : number) : boolean {
        return this.pricePeaks.setSellSlippage(positionID, sellSlippagePercent)
    }

    updatePrice(newPrice : DecimalizedAmount) : void {

        // update the peak prices
        
        this.pricePeaks.update(newPrice);
        // Note: mark them as closing, keeping them in the tracker!!!
        // SUPER CRITICAL to mark as closing to prevent them from;
        // 1. Being double-sold
        // 2. To keep them being monitored in case the sell fails
        /*for (const positionToClose of positionsToClose) {
            positionToClose.status = PositionStatus.Closing;
        }*/
    }

    collectPositionsToClose(newPrice : DecimalizedAmount) : Position[] {
        const positionsToClose = this.pricePeaks.collectPositionsToClose(newPrice);
        return positionsToClose;
    }

    getUnconfirmedBuys() : (Position & { buyConfirmed : false })[] {
        return this.pricePeaks.getUnconfirmedBuys();
    }

    getUnconfirmedSells() : (Position & { sellConfirmed : false })[] {
        return this.pricePeaks.getUnconfirmedSells();
    }

    markPositionAsOpen(positionID : string) {
        this.pricePeaks.markAsOpen(positionID);      
    }

    // idempotentally mark as closing
    markPositionAsClosing(positionID : string) {

        this.pricePeaks.markAsClosing(positionID);
    }

    // idempotentally mark position as closed from price tracking
    closePosition(positionID : string, netPNL : DecimalizedAmount) {
        // also, remove it from peak prices data structure
        const maybeRemovedPosition = this.pricePeaks.remove(positionID);
        if (maybeRemovedPosition != null) {
            maybeRemovedPosition.netPNL = netPNL;
            maybeRemovedPosition.status = PositionStatus.Closed;
            this.closedPositions.set(maybeRemovedPosition.positionID, maybeRemovedPosition)
        }
    }

    // idempotentially remove position.
    removePosition(positionID : string) {
        this.pricePeaks.remove(positionID);
    }

    initialize(entries : Map<string,any>) {
        try {
            this.pricePeaks.initialize(entries);
            this.closedPositions.initialize(entries);
        }
        catch(e) {
            logError(`Error initializing token_pair_position_tracker`, e);
        }
    }

    async flushToStorage(storage : DurableObjectStorage) : Promise<void> {
        return Promise.all([
            this.pricePeaks.flushToStorage(storage),
            this.closedPositions.flushToStorage(storage)
        ]).catch(() => {
            logError("Flushing to storage failed for TokenPairPositionTracker", this);
            return;
        }).then(() => {
            logDebug("Done flushing to storage");
            return;
        });
    }
}