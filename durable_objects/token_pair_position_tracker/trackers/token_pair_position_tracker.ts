import { DecimalizedAmount } from "../../../decimalized";
import { logError } from "../../../logging";
import { Position } from "../../../positions";
import { MapWithStorage } from "../../../util";
import { PositionAndMaybePNL } from "../model/position_and_PNL";
import { PeakPricePositionTracker } from "./peak_price_tracker";

export interface PositionsToClose {
    positionsToClose : Position[]
}

export class TokenPairPositionTracker {

    // special-purpose datastructure for tracking peak prices
    pricePeaks : PeakPricePositionTracker = new PeakPricePositionTracker("pricePeaks");

    // positions confirmed as closed - may be resurrected under unusual circumstances
    closedPositions : MapWithStorage<Position> = new MapWithStorage<Position>("closedPositions");

    constructor() {
    }

    any() : boolean {
        return  this.pricePeaks.any();
    }

    getPositionAndMaybePNL(positionID : string) : PositionAndMaybePNL|undefined {
        return this.pricePeaks.getPositionAndMaybePNL(positionID);
    }

    getPosition(positionID : string) : Position|undefined {
        const result = this.pricePeaks.getPosition(positionID);
        return result;
    }

    listByUser(userID : number) : PositionAndMaybePNL[] {
        return this.pricePeaks.listByUser(userID);
    }

    upsertPositions(positions : Position[]) {
        for (const position of positions) {
            // idempotentally add (can also work as an update)
            this.pricePeaks.add(position.fillPrice, position);
        }
    }

    updatePrice(newPrice : DecimalizedAmount) : PositionsToClose {

        // update the peak prices
        const positionsToClose = this.pricePeaks.update(newPrice);

        // Note: mark them as closing, keeping them in the tracker!!!
        // SUPER CRITICAL to mark as closing to prevent them from;
        // 1. Being double-sold
        // 2. To keep them being monitored in case the sell fails
        /*for (const positionToClose of positionsToClose) {
            positionToClose.status = PositionStatus.Closing;
        }*/

        return {
            positionsToClose: positionsToClose
        };
    }

    markPositionAsOpen(positionID : string) {
        this.pricePeaks.markAsOpen(positionID);

        // TODO: ZOMBIE POSITION
        // if it is closed, move it to closing (this is highly unusual and should not occur)
        /*const closedPosition = this.closedPositions.get(positionID);
        if (closedPosition) {
            this.closedPositions.delete(positionID);
            closedPosition.status = PositionStatus.Closing;
            // TODO: this isn't quite correct.  other peaks may have been hit while not tracked.
            this.pricePeaks.add(closedPosition.fillPrice, closedPosition);
        }*/        
    }

    // idempotentally mark as closing
    markPositionAsClosing(positionID : string) {

        this.pricePeaks.markAsClosing(positionID);

        // no need for action if already closing...

        // TODO: ZOMBIE POSITION
        // if it is closed, move it to closing (this is highly unusual and should not occur)
        /*const closedPosition = this.closedPositions.get(positionID);
        if (closedPosition) {
            this.closedPositions.delete(positionID);
            closedPosition.status = PositionStatus.Closing;
            // TODO: this isn't quite correct.  other peaks may have been hit while not tracked.
            this.pricePeaks.add(closedPosition.fillPrice, closedPosition);
        }*/
    }

    // idempotentally mark position as closed from price tracking
    // TODO: keep closed positions in price tracking for a while (aka: implement zombie positions)
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