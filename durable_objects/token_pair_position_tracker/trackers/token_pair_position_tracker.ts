import { DecimalizedAmount } from "../../../decimalized";
import { logError } from "../../../logging";
import { Position, PositionStatus } from "../../../positions";
import { MapWithStorage, TwoLevelMapWithStorage } from "../../../util";
import { PositionAndMaybePNL } from "../model/position_and_PNL";
import { PeakPricePositionTracker } from "./peak_price_tracker";

export interface ActionsToTake {
    positionsToClose : Position[]
    buysToConfirm : Position[]
    sellsToConfirm : Position[]
}

type DeactivatedPosition = Position & { peakPrice : DecimalizedAmount };

// This class is really the heart of the whole application.
// It tracks prices, and automatically dispatches requests to update positions
// Point being, you can screw the whole app by messing this one up.
export class TokenPairPositionTracker {

    // special-purpose datastructure for tracking peak prices
    pricePeaks : PeakPricePositionTracker = new PeakPricePositionTracker("pricePeaks");

    // positions confirmed as closed - may be resurrected under unusual circumstances
    closedPositions : MapWithStorage<Position> = new MapWithStorage<Position>("closedPositions");

    deactivatedPositions : TwoLevelMapWithStorage<number,string,DeactivatedPosition> = new TwoLevelMapWithStorage<number,string,DeactivatedPosition>("deactivatedPositions", 'Integer', 'string');
    
    constructor() {
    }

    __clearAllPositions() {
        this.pricePeaks.__clearAllPositions();
    }

    incrementOtherSellFailureCount(positionID : string) : { success : true, newCount: number }|{ success : false } {
        const position = this.getPosition(positionID);
        if (position == null) {
            return { success : false }
        }
        else {
            const newCount = (position.otherSellFailureCount||0)+1; // || for backwards compat with older objects
            position.otherSellFailureCount = newCount;
            return { success : true, newCount }
        }
    }

    deleteClosedPositionsForUser(telegramUserID : number) {
        // TODO: make 2-level lookup by user.
        const closedPositions = [...this.closedPositions.values()]
        for (const closedPosition of closedPositions) {
            if (closedPosition.userID === telegramUserID) {
                this.closedPositions.delete(closedPosition.positionID);
            }
        }
    }

    listAllPositions() : Position[] {
        return this.pricePeaks.listAllPositions();
    }

    listClosedPositionsForUser(telegramUserID : number) : Position[] {
        const result : Position[] = [];
        // TODO: do a 2-level lookup by user. This won't scale.
        for (const closedPosition of this.closedPositions.values()) {
            if (closedPosition.userID === telegramUserID) {
                result.push(closedPosition);
            }
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

    insertPosition(position : Position, currentPrice : DecimalizedAmount) : boolean {
        return this.pricePeaks.insertPosition(position, currentPrice);
    }

    updateSlippage(positionID : string, sellSlippagePercent : number) : boolean {
        return this.pricePeaks.setSellSlippage(positionID, sellSlippagePercent)
    }

    updatePrice(newPrice : DecimalizedAmount) : void {

        // update the peak prices
        
        this.pricePeaks.update(newPrice);

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
    removePosition(positionID : string) : Position|undefined {
        return this.pricePeaks.remove(positionID);
    }

    deactivatePosition(positionID : string) : boolean {
        const position = this.getPosition(positionID);
        if (position == null) {
            return false;
        }
        const peakPrice = this.pricePeaks.getPeakPrice(positionID);
        if (peakPrice == null) {
            return false;
        }
        // can't deactivat position whose buy isn't confirmed, and whose status is Closing or Closed
        // (TODO: will this make it hard for users to deactivate if stuck in a sell loop?)
        // (answer: yes, but if we have a max sell attempts we can auto-deactivate)          
        if (!position.buyConfirmed || position.status !== PositionStatus.Open) {
            return false;
        }
        this.removePosition(positionID);
        this.deactivatedPositions.insert(position.userID, position.positionID, { ...position, peakPrice : peakPrice });
        return true;
    }

    reactivatePosition(userID : number, positionID : string, currentPrice : DecimalizedAmount) : boolean {
        const deactivatedPosition = this.deactivatedPositions.get(userID, positionID);
        if (deactivatedPosition == null) {
            return false;
        }
        const peakPrice = deactivatedPosition.peakPrice;
        this.insertPosition(deactivatedPosition, peakPrice);
        this.deactivatedPositions.delete(userID, positionID);
        return true;
    }

    listDeactivatedPositionsByUser(userID : number) : Position[] {
        return this.deactivatedPositions.list(userID);
    }

    getDeactivatedPosition(userID : number, positionID : string) : Position|undefined {
        return this.deactivatedPositions.get(userID, positionID);
    }

    initialize(entries : Map<string,any>) {
        try {
            this.pricePeaks.initialize(entries);
            this.closedPositions.initialize(entries);
            this.deactivatedPositions.initialize(entries);
        }
        catch(e) {
            logError(`Error initializing token_pair_position_tracker`, e);
        }
    }

    async flushToStorage(storage : DurableObjectStorage) : Promise<void> {
        return Promise.all([
            this.pricePeaks.flushToStorage(storage),
            this.closedPositions.flushToStorage(storage),
            this.deactivatedPositions.flushToStorage(storage)
        ]).catch(() => {
            logError("Flushing to storage failed for TokenPairPositionTracker", this);
            return;
        }).then(() => {
            return;
        });
    }
}