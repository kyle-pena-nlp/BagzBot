import { DecimalizedAmount } from "../../../decimalized";
import { logError } from "../../../logging";
import { Position, PositionStatus } from "../../../positions";
import { MapWithStorage } from "../../../util";
import { PeakPricePositionTracker } from "./peak_price_tracker";

export interface PositionsToClose {
    positionsToClose : Position[]
}

export class TokenPairPositionTracker {

    // new open positions collected by the callback from the dex
    //newOpenPositions : MapWithStorage<Position> = new MapWithStorage<Position>("newOpenPositions");
    
    // all open positions
    openPositions : MapWithStorage<Position> = new MapWithStorage<Position>("openPositions");

    // special-purpose datastructure for tracking peak prices
    pricePeaks : PeakPricePositionTracker = new PeakPricePositionTracker("pricePeaks");

    // positions that have been sent to be closed but closing has not been filled/confirmed
    closingPositions : MapWithStorage<Position> = new MapWithStorage<Position>("closingPositions");

    // TODO: unused, remove.
    // positions confirmed as closed
    closedPositions : MapWithStorage<Position> = new MapWithStorage<Position>("closedPositions");

    constructor() {
    }

    any() : boolean {
        return  this.openPositions.size > 0 ||
                this.closingPositions.size > 0;
    }

    listByUser(userID : number) : Position[] {
        return this.pricePeaks.listByUser(userID);
    }

    importNewOpenPositions(positions : Position[]) {
        for (const position of positions) {
            // this is a staging area for positions
            this.pricePeaks.add(position.fillPrice, position);
        }
    }

    updatePrice(newPrice : DecimalizedAmount) : PositionsToClose {

        // update the peak prices
        const positionsToClose = this.pricePeaks.update(newPrice);

        // find out which positions to close
        //const positionsToClose = this.pricePeaks.collectTrailingStopLossesToClose(newPrice);
        
        // mark them as closing and move to closing queue -
        // SUPER CRITICAL to mark as closing to prevent them from;
        // 1. Being double-sold
        // 2. To keep them being monitored in case the sell fails
        for (const positionToClose of positionsToClose) {
            positionToClose.status = PositionStatus.Closing;
            this.openPositions.delete(positionToClose.positionID);
            this.closingPositions.set(positionToClose.positionID, positionToClose);
        }

        return {
            positionsToClose: positionsToClose
        };
    }

    markPositionAsClosing(positionID : string) {

        // if it is in open, move it to closing
        const openPosition = this.openPositions.get(positionID);
        if (openPosition) {
            this.openPositions.delete(positionID);
            openPosition.status = PositionStatus.Closing; // setting status prevents data structure from attempting to close again
            this.closingPositions.set(positionID, openPosition);
        }

        this.pricePeaks.markAsClosing(positionID);

        // no need for action if already closing...


        // if it is closed, move it to closing (this is highly unusual and should not occur)
        const closedPosition = this.closedPositions.get(positionID);
        if (closedPosition) {
            this.closedPositions.delete(positionID);
            closedPosition.status = PositionStatus.Closing;
            this.closingPositions.set(positionID, closedPosition);
        }
    }

    closePosition(positionID : string) {

        // if the position has been sent to the dex and hasn't been filled/confirmed,
        // nothing can be done yet.

        // if open, move to closing
        const openPosition = this.openPositions.get(positionID);
        if (openPosition) {
            this.openPositions.delete(positionID);
            openPosition.status = PositionStatus.Closed; // setting status prevents data structure from attempting to close again
            this.closedPositions.set(positionID, openPosition);
        }

        // also, remove it from peak prices data structure
        this.pricePeaks.remove(positionID);

        // if closing, move to closed
        const closingPosition = this.closingPositions.get(positionID);
        if (closingPosition) {
            this.closingPositions.delete(positionID);
            closingPosition.status = PositionStatus.Closed;
            this.closedPositions.set(positionID, closingPosition);
        }
    }


    initialize(entries : Map<string,any>) {
        this.openPositions.initialize(entries);
        this.pricePeaks.initialize(entries);
        this.closingPositions.initialize(entries);
        this.closedPositions.initialize(entries);
    }

    async flushToStorage(storage : DurableObjectStorage) : Promise<void> {
        return Promise.all([
            this.openPositions.flushToStorage(storage),
            this.pricePeaks.flushToStorage(storage),
            this.closingPositions.flushToStorage(storage),
            this.closedPositions.flushToStorage(storage)
        ]).catch(() => {
            logError("Flushing to storage failed for TokenPairPositionTracker", this);
            return;
        }).then(() => {
            return;
        });
    }
}