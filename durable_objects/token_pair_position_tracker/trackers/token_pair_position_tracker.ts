import { DecimalizedAmount } from "../../../positions/decimalized_amount";
import { Position, PositionRequest, PositionStatus } from "../../../positions/positions";
import { PeakPricePositionTracker } from "./peak_price_tracker";
import { SessionTrackedMap } from "./session_tracked_map";

export interface PositionsToClose {
    positionsToClose : Position[]
}

export class TokenPairPositionTracker {

    // positions sent to DEX yet not filled/confirmed
    sentPositionRequests : SessionTrackedMap<PositionRequest> = new SessionTrackedMap<PositionRequest>("sentPositionRequests");

    // new open positions collected by the callback from the dex
    newOpenPositions : SessionTrackedMap<Position> = new SessionTrackedMap<Position>("newOpenPositions");
    
    // all open positions
    openPositions : SessionTrackedMap<Position> = new SessionTrackedMap<Position>("openPositions");

    // special-purpose datastructure for tracking peak prices
    pricePeaks : PeakPricePositionTracker = new PeakPricePositionTracker("pricePeaks");

    // positions that have been sent to be closed but closing has not been filled/confirmed
    closingPositions : SessionTrackedMap<Position> = new SessionTrackedMap<Position>("closingPositions");

    // positions confirmed as closed
    closedPositions : SessionTrackedMap<Position> = new SessionTrackedMap<Position>("closedPositions");

    constructor() {
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
        this.pricePeaks.update(newPrice);

        // find out which positions to close
        const positionsToClose = this.pricePeaks.collectTrailingStopLossesToClose(newPrice);
        // mark them as closing and move to closing queue
        for (const positionToClose of positionsToClose) {
            positionToClose.status = PositionStatus.Closing;
            this.openPositions.delete(positionToClose.positionID);
            this.closingPositions.set(positionToClose.positionID, positionToClose);
        }

        return {
            positionsToClose: positionsToClose
        }
    }

    manuallyClosePosition(positionID : string) : PositionsToClose {
        
        const positionsToClose : Position[] = [];

        // if the position has been sent to the dex and hasn't been filled/confirmed,
        // nothing can be done yet.

        // if it has been filled but isn't in the data structure, send to closing queue and ask exchange to close it
        const newOpenPosition = this.newOpenPositions.get(positionID)
        if (newOpenPosition) {
            this.newOpenPositions.delete(positionID);
            newOpenPosition.status = PositionStatus.Closing;
            this.closingPositions.set(positionID, newOpenPosition);
            positionsToClose.push(newOpenPosition);
        }

        // if it is in the datastructure, fetch it and put it in the closing queue, and ask the exchange to close it.
        const openPosition = this.openPositions.get(positionID);
        if (openPosition) {
            this.openPositions.delete(positionID);
            openPosition.status = PositionStatus.Closing; // setting status prevents data structure from attempting to close again
            this.closingPositions.set(positionID, openPosition);
            positionsToClose.push(openPosition);
        }

        // if the position is closing, no need to do anything
        // if the position is closed, no need to do anything

        return {
            positionsToClose: positionsToClose
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
            // TODO: logging here?
            return;
        });
    }
}