import { DecimalizedAmount } from "../../../decimalized";
import { logError } from "../../../logging";
import { Position } from "../../../positions";
import { MapWithStorage } from "../../../util";
import { PositionAndMaybePNL } from "../model/position_and_PNL";
import { PeakPricePositionTracker } from "./peak_price_tracker";

export interface ActionsToTake {
    positionsToClose : Position[]
    buysToConfirm : Position[]
    sellsToConfirm : Position[]
}

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

    upsertPositions(positions : Position[]) {
        for (const position of positions) {
            // idempotentally add (can also work as an update)
            this.pricePeaks.upsertPosition(position);
        }
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
    closePosition(positionID : string) {
        // also, remove it from peak prices data structure
        const maybeRemovedPosition = this.pricePeaks.remove(positionID);
        if (maybeRemovedPosition != null) {
            this.closedPositions.set(maybeRemovedPosition.positionID, maybeRemovedPosition)
        }
    }

    // idempotentially remove position.
    removePosition(positionID : string) {
        this.pricePeaks.remove(positionID);
    }

    initialize(entries : Map<string,any>) {
        this.pricePeaks.initialize(entries);
        this.closedPositions.initialize(entries);
    }

    async flushToStorage(storage : DurableObjectStorage) : Promise<void> {
        return Promise.all([
            this.pricePeaks.flushToStorage(storage),
            this.closedPositions.flushToStorage(storage)
        ]).catch(() => {
            logError("Flushing to storage failed for TokenPairPositionTracker", this);
            return;
        }).then(() => {
            return;
        });
    }
}