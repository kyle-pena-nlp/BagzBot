import { DecimalizedAmount } from "../../../decimalized";
import { logError } from "../../../logging";
import { Position, PositionRequest, PositionStatus } from "../../../positions";
import { MapWithStorage } from "../../../util";
import { PeakPricePositionTracker } from "./peak_price_tracker";

export interface PositionsToClose {
    positionsToClose : Position[]
}

export class TokenPairPositionTracker {

    // TODO: unused, remove.
    // positions sent to DEX yet not filled/confirmed
    sentPositionRequests : MapWithStorage<PositionRequest> = new MapWithStorage<PositionRequest>("sentPositionRequests");

    // new open positions collected by the callback from the dex
    newOpenPositions : MapWithStorage<Position> = new MapWithStorage<Position>("newOpenPositions");
    
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
        return  this.newOpenPositions.size > 0 ||
                this.openPositions.size > 0 ||
                this.closingPositions.size > 0;
    }

    importNewOpenPositions(positions : Position[]) {
        for (const position of positions) {
            this.newOpenPositions.set(position.positionID, position);
        }
    }

    addPositionRequest(positionRequest : PositionRequest) {
        this.sentPositionRequests.set(positionRequest.positionID, positionRequest);
    }

    callbackSuccessFilledPosition(position : Position) {
        this.sentPositionRequests.delete(position.positionID);
        this.newOpenPositions.set(position.positionID, position);
    }

    callbackFailureFilledPosition(position : Position) {
        this.sentPositionRequests.delete(position.positionID);
    }

    updatePrice(newPrice : DecimalizedAmount) : PositionsToClose {

        // take new open positions out of staging and into the data structure(s)
        for (const [positionID,newOpenPosition] of this.newOpenPositions) {
            // add it to set of all open positions
            this.openPositions.set(newOpenPosition.positionID, newOpenPosition);            
            // add it to peak price tracking
            this.pricePeaks.push(newOpenPosition.fillPrice, newOpenPosition);
        }
        this.newOpenPositions.clear();

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

        // if it is new, move it to closing
        const newOpenPosition = this.newOpenPositions.get(positionID);
        if (newOpenPosition) {
            this.newOpenPositions.delete(positionID);
            newOpenPosition.status = PositionStatus.Closing;
            this.closingPositions.set(positionID, newOpenPosition);
        }

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

        // if new, move to closing
        const newOpenPosition = this.newOpenPositions.get(positionID);
        if (newOpenPosition) {
            this.newOpenPositions.delete(positionID);
            newOpenPosition.status = PositionStatus.Closed;
            this.closedPositions.set(positionID, newOpenPosition);
        }

        // if open, move to closing
        const openPosition = this.openPositions.get(positionID);
        if (openPosition) {
            this.openPositions.delete(positionID);
            openPosition.status = PositionStatus.Closed; // setting status prevents data structure from attempting to close again
            this.closedPositions.set(positionID, openPosition);
        }

        // also, remove it from peak prices data structure
        this.pricePeaks.removePosition(positionID);

        // if closing, move to closed
        const closingPosition = this.closingPositions.get(positionID);
        if (closingPosition) {
            this.closingPositions.delete(positionID);
            closingPosition.status = PositionStatus.Closed;
            this.closedPositions.set(positionID, closingPosition);
        }
    }


    initialize(entries : Map<string,any>) {
        this.sentPositionRequests.initialize(entries);
        this.openPositions.initialize(entries);
        this.pricePeaks.initialize(entries);
        this.closingPositions.initialize(entries);
        this.closedPositions.initialize(entries);
    }

    async flushToStorage(storage : DurableObjectStorage) : Promise<void> {
        return Promise.all([
            this.sentPositionRequests.flushToStorage(storage),
            this.openPositions.flushToStorage(storage),
            this.pricePeaks.flushToStorage(storage),
            this.closingPositions.flushToStorage(storage),
            this.closedPositions.flushToStorage(storage)
        ]).then(() => {
            // voidx5 -> void
            logError("Flushing to storage failed for TokenPairPositionTracker")
            return;
        });
    }
}