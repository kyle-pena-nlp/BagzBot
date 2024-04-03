import * as dMath from "../../../decimalized";
import { DecimalizedAmount, DecimalizedAmountSet, MATH_DECIMAL_PLACES, dAdd, fromKey, fromNumber, toKey } from "../../../decimalized";
import { dZero } from "../../../decimalized/decimalized_amount";
import { logError } from "../../../logging";
import { Position, PositionStatus, PositionType } from "../../../positions";
import { setDifference, setIntersection, setUnion, structuralEquals } from "../../../util";
import { PositionAndMaybePNL } from "../model/position_and_PNL";
import { PositionsAssociatedWithPeakPrices } from "./positions_associated_with_peak_prices";

/* 
    CONTAINS POSITION LIST FOR THE ENTIRE APP FOR THIS TOKEN PAIR!
    This class maintains lists of positions grouped by peak price thus far
        (Which is a function of when the position was opened)
    Flushing to storage is achieved by diffing from a buffer of internal state 
        and writing deltas.
    The update method determines which TLS positions should be closed based on the latest prices.
    Positions can also be marked as closing (which excludes them from being sent to be sold off)
    And positions can be removed from tracking
*/
export class PeakPricePositionTracker {
    /*
        An important note ----
            itemsByPeakPrice contains SPARSE arrays
            and should only be foreach'ed over
            (otherwise, we waste clock time iterating over large stretches of undefined)
    */

    /* positions grouped by peakPrice, and a buffer for diffing purposes since last flush to storage */
    _buffer : PositionsAssociatedWithPeakPrices = new PositionsAssociatedWithPeakPrices();
    itemsByPeakPrice : PositionsAssociatedWithPeakPrices = new PositionsAssociatedWithPeakPrices();
    pricePeakSessionKeyPrefix : string;

    constructor(pricePeakSessionKeyPrefix : string) {
        this.pricePeakSessionKeyPrefix = pricePeakSessionKeyPrefix;
    }
    clearAllPositions() {
        this._buffer.clear()
        this.itemsByPeakPrice.clear()
    }
    any() : boolean {
        return this.itemsByPeakPrice.any();
    }
    add(price : DecimalizedAmount, position : Position) {
        this.itemsByPeakPrice.add(price, position);
    }
    listByUser(userID : number, currentPrice : DecimalizedAmount|null) : PositionAndMaybePNL[] {
        const positionsAndMaybePNLs = this.itemsByPeakPrice.listByUser(userID, currentPrice);
        return positionsAndMaybePNLs;
    }
    measurePNLForUser(userID : number, currentPrice : DecimalizedAmount) : DecimalizedAmount|undefined {
        const positionsWithMaybePNL = this.listByUser(userID, currentPrice);
        let totalPNL = dZero();
        for (const pos of positionsWithMaybePNL) {
            if (pos.PNL == null) {
                logError(`Couldn't calculate total PNL b/c didn't have measured PNL: ${userID}, ${pos.position.positionID}`);
                return;
            }
            totalPNL = dAdd(totalPNL, pos.PNL.PNL);
        }
        return totalPNL;
    }
    markAsClosing(positionID : string) {
        this.itemsByPeakPrice.markAsClosing(positionID);
    }
    markAsOpen(positionID : string) {
        this.itemsByPeakPrice.markAsOpen(positionID);
    }
    remove(positionID : string) : Position|undefined {
        return this.itemsByPeakPrice.removePosition(positionID);
    }
    update(newPrice : DecimalizedAmount) : void {
        const peaks = [...this.itemsByPeakPrice.keys()];
        const mergedPeaks : DecimalizedAmount[] = [];
        const mergedPositions : (Position|undefined)[] = [];
        // the sort is important for correctness for early termination (break)
        peaks.sort(dMath.dCompare);
        for (const peak of peaks) {
            // if the new price is GT than peak, roll the positions in that peak into the new list
            if (dMath.dCompare(peak, newPrice) < 0) {
                // mark for deletion the peak that is being rolled into the bigger peak 
                mergedPeaks.push(peak);
                // add all the positions at this peak into the merge list
                (this.itemsByPeakPrice.get(peak)||[]).forEach((position) => {
                    if (position == null) {
                        return;
                    }
                    mergedPositions.push(position);
                });
            }
            else {
                break;
            }
        }
        for (const mergedPeak of mergedPeaks) {
            this.itemsByPeakPrice.delete(mergedPeak);
        }
        if (mergedPositions.length) {
            this.itemsByPeakPrice.set(newPrice, mergedPositions);
        }
    }
    getPeakPrice(positionID : string) : DecimalizedAmount|undefined {
        return this.itemsByPeakPrice.getPeakPrice(positionID);
    }
    getPositionAndMaybePNL(positionID : string, currentPrice : DecimalizedAmount|null) : PositionAndMaybePNL|undefined {
        return this.itemsByPeakPrice.getPositionAndMaybePNL(positionID, currentPrice);
    }
    getPosition(positionID : string) : Position|undefined {
        return this.itemsByPeakPrice.getPosition(positionID);
    }
    // NEVER MARK THIS METHOD AS ASYNC!!!! (and subsequently do anything async in it)
    // We don't want double-firing of sells, so we need this method to be atomic in execution.
    collectPositionsToClose(newPrice : DecimalizedAmount) : Position[] {
        
        // collect TSL positions to be closed
        const positionsToClose : Position[] = [];

        // for each group of trades with the same peak price
        for (const peakPrice of this.itemsByPeakPrice.keys()) {

            // if the new price is greater than the peak, no need to consider this group further
            if (dMath.dCompare(peakPrice, newPrice) < 0) {
                continue;
            }

            // compute percent price decrease fraction from the peak
            const priceDecreaseFrac = dMath.dDiv(
                dMath.dSub(peakPrice, newPrice), 
                peakPrice, 
                MATH_DECIMAL_PLACES) || dZero();
            
            // for each position in this group
            (this.itemsByPeakPrice.get(peakPrice)||[]).forEach((position,index) => {

                // Skip if position was deleted from array
                if (position == null) {
                    return;
                }

                // Very important so as to prevent double firing of sells
                if (position.status !== PositionStatus.Open) {
                    return;
                }

                // Rule for sanity: Can't sell until the buy is confirmed.
                if (!position.buyConfirmed) {
                    return;
                }

                // If it's not a TSL, skip.
                if (position.type !== PositionType.LongTrailingStopLoss) {
                    return;
                }

                // compute trigger pct for this position
                const triggerPctFrac = dMath.dMoveDecimalLeft(
                    fromNumber(position.triggerPercent, MATH_DECIMAL_PLACES), 2);
                
                // if the percent price decrease exceeds the trigger pct, the trade is trigger.
                const tradeIsTriggered = dMath.dCompare(priceDecreaseFrac, triggerPctFrac) >= 0;
                
                // if not, skip it.
                if (!tradeIsTriggered) {
                    return;
                }

                // But if it is triggered, add it to the list of positions to close
                positionsToClose.push(position);
                
            });
        }

        // very important so as to prevent double-firing of sells
        for (const position of positionsToClose) {
            position.sellConfirmed = false;
            position.status = PositionStatus.Closing;
        }

        return positionsToClose;
    }
    getUnconfirmedBuys() : (Position & { buyConfirmed : false })[] {
        return this.itemsByPeakPrice.getUnconfirmedBuys();
    }
    getUnconfirmedSells() : (Position & { sellConfirmed : false })[] {
        return this.itemsByPeakPrice.getUnconfirmedSells();
    }
    initialize(entries : Map<string,any>) {
        // find storage itemsByPeakPrice prefixed with proper prefix, get price key, get array index, and set on this.itemsByPeakPrice at that index.
        const prefixRegex = this.prefixRegex();
        for (const [key,value] of entries) {
            if (prefixRegex.test(key)) {
                const [price,index] = this.parseStorageKey(key);
                if (!this.itemsByPeakPrice.has(price)) {
                    this.itemsByPeakPrice.set(price,[]);
                }
                this.itemsByPeakPrice._setAtIndex(price, index, value);
            }
        }
        // when done initializing, copy state to _buffer to avoid writing back fresh state to storage
        this.overwriteBufferWithCurrentState();
    }
    async flushToStorage(storage : DurableObjectStorage) {
        const [putEntries,deletedKeys] = this.generateDiffFromItemsBuffer();        
        const putPromise = storage.put(putEntries);
        const deletePromise = storage.delete([...deletedKeys]);
        await Promise.all([putPromise,deletePromise]).then(() => {
            this.overwriteBufferWithCurrentState();
        });
    }
    private generateDiffFromItemsBuffer() : [Record<string,Position>,Set<string>] {

        const currentPriceSet = new DecimalizedAmountSet(this.itemsByPeakPrice.keys());
        const oldPriceSet = new DecimalizedAmountSet(this._buffer.keys());

        const putEntries : Record<string,Position> = {};
        const deletedKeys : Set<string> = new Set<string>();

        // add new entries for new price keys
        const newPrices = setDifference(currentPriceSet, oldPriceSet, DecimalizedAmountSet);
        for (const newPrice of newPrices) {
            (this.itemsByPeakPrice.get(newPrice)||[]).forEach((position, index) => {
                if (position == null) {
                    // skip entries that have been deleted
                    return;
                }
                putEntries[this.makeStorageKey(newPrice,index)] = position;
            });
        }

        // for each price in common between here and last persistence, compare by array position
        const commonPrices = setIntersection(currentPriceSet, oldPriceSet, DecimalizedAmountSet);
        for (const commonPrice of commonPrices) {

            // compare the old and new groups of positions for this peak price
            const oldArray = this._buffer.get(commonPrice)||[];
            const newArray = this.itemsByPeakPrice.get(commonPrice)||[];

            // carefully get a list of unique indices present in either
            const newIndices = new Set<number>(Object.keys(newArray).map(index => parseInt(index,10)));
            const oldIndices = new Set<number>(Object.keys(oldArray).map(index => parseInt(index,10)));
            const allIndices = setUnion(newIndices, oldIndices, Set<number>);
            const allIndicesArray = [...allIndices];
            
            // for each index
            for (const i of allIndicesArray) {

                const oldPosition = oldArray[i];
                const newPosition = newArray[i];

                // if position is present in both arrays at this index
                if ((oldPosition != null) && (newPosition != null)) {
                    if (!this.positionsEqualByValue(oldPosition,newPosition)) {
                        putEntries[this.makeStorageKey(commonPrice,i)] = newPosition;
                    }
                }
                // if position is present only in old array at this index
                else if (newPosition == null && oldPosition != null) {
                    // deleted in new array
                    deletedKeys.add(this.makeStorageKey(commonPrice, i));
                }
                // if position is present only in new array at this index
                else if (newPosition != null && oldPosition == null) {
                    // new in new array
                    putEntries[this.makeStorageKey(commonPrice,i)] = newPosition;
                }
            }
        }

        // for each price in the buffer, no longer in the items, mark it as deleted.
        const deletedPrices = setDifference(oldPriceSet, currentPriceSet, DecimalizedAmountSet);
        for (const deletedPrice of deletedPrices) {
            (this._buffer.get(deletedPrice)||[]).forEach((position, index) => {
                if (position == null) {
                    return;
                }
                const storageKey = this.makeStorageKey(deletedPrice, index);
                deletedKeys.add(storageKey);
            });
        }

        return [putEntries,deletedKeys];
    }
    private prefixRegex() : RegExp {
        const regexEscapedPrefix = this.pricePeakSessionKeyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^${regexEscapedPrefix}:`);
    }
    private parseStorageKey(key : string) : [DecimalizedAmount,number] {
        const [prefix,priceString,indexString] = key.split(":");
        return [fromKey(priceString), parseInt(indexString,10)];
    }
    private makeStorageKey(price : DecimalizedAmount, index : number) : string {
        return `${this.pricePeakSessionKeyPrefix}:${toKey(price)}:${index.toString()}`;
    }
    private overwriteBufferWithCurrentState() {
        this._buffer.clear();
        for (const key of this.itemsByPeakPrice.keys()) {
            this._buffer.set(key, []);
            const currentItems = this.itemsByPeakPrice.get(key)||[];
            currentItems.forEach((position) => {
                if (position == null) {
                    return;
                }
                const clonedPositionObject = structuredClone(position);
                this._buffer.add(key, clonedPositionObject);
            })
        }
    }
    private positionsEqualByValue(a : Position, b : Position) : boolean {
        return structuralEquals(a,b);
    }
}