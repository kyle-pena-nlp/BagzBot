import * as dMath from "../../../decimalized";
import { DecimalizedAmount, DecimalizedAmountSet, MATH_DECIMAL_PLACES, fromKey, fromNumber, toKey } from "../../../decimalized";
import { Position, PositionStatus, PositionType } from "../../../positions";
import { setDifference, setIntersection, structuralEquals } from "../../../util";
import { PositionsAssociatedWithPeakPrices } from "./positions_associated_with_peak_prices";

/* 
    This class maintains lists of positions grouped by peak price thus far
        (Which is a function of when the position was opened)
    Flushing to storage is achived by diffing from a buffer of internal state 
        and writing changes.
    The update method determines which TLS positions should be closed based on the latest prices.
    Positions can also be marked as closing (which excludes them from being sent to be sold off)
    And positions can be removed from tracking
*/
export class PeakPricePositionTracker {

    /* positions grouped by peakPrice, and a buffer for diffing purposes since last flush to storage */
    _buffer : PositionsAssociatedWithPeakPrices = new PositionsAssociatedWithPeakPrices();
    itemsByPeakPrice : PositionsAssociatedWithPeakPrices = new PositionsAssociatedWithPeakPrices();
    pricePeakSessionKeyPrefix : string;    

    constructor(pricePeakSessionKeyPrefix : string) {
        this.pricePeakSessionKeyPrefix = pricePeakSessionKeyPrefix;
    }
    push(price : DecimalizedAmount, position : Position) {
        this.itemsByPeakPrice.push(price, position);
    }
    markAsClosing(positionID : string) {
        this.itemsByPeakPrice.markAsClosing(positionID);
    }
    removePosition(positionID : string) {
        this.itemsByPeakPrice.removePosition(positionID);
    }
    update(newPrice : DecimalizedAmount) : Position[] {
        const peaks = [...this.itemsByPeakPrice.keys()];
        peaks.sort(dMath.dCompare);
        const mergedPeaks = [];
        const mergedPositions = [];
        for (const peak of peaks) {
            // if the new price is greater than this peak, roll in this peak to the merged peak
            if (dMath.dCompare(peak, newPrice) < 0) {
                mergedPeaks.push(peak);
                mergedPositions.push(...this.itemsByPeakPrice.get(peak)!!);
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
        return this.collectTrailingStopLossesToClose(newPrice);
    }
    private collectTrailingStopLossesToClose(newPrice : DecimalizedAmount) : Position[] {
        
        // collect TSL positions to be closed
        const positionsToClose = [];

        // for each group of trades with the same peak price
        for (const peakPrice of this.itemsByPeakPrice.keys()) {

            // if the new price is greater than the peak, no need to consider this group further
            if (dMath.dCompare(peakPrice, newPrice) < 0) {
                continue;
            }

            // compute percent price decrease fraction from the peak
            const priceDecreaseFrac = dMath.dDiv(dMath.dSub(peakPrice, newPrice), peakPrice, MATH_DECIMAL_PLACES);
            
            // for each position in this group
            for (const position of this.itemsByPeakPrice.get(peakPrice)!!) {
                
                // If it is not an open position, skip.
                if (position.status !== PositionStatus.Open) {
                    continue;
                }
                
                // If it's not a TSL, skip
                if (position.type === PositionType.LongTrailingStopLoss) {
                    
                    // compute trigger pct for this position
                    const triggerPctFrac = dMath.dMoveDecimalLeft(
                        fromNumber(position.triggerPercent, MATH_DECIMAL_PLACES), 2);
                    
                    // if the percent price decrease exceeds the trigger pct, the trade is trigger.
                    const tradeIsTriggered = dMath.dCompare(priceDecreaseFrac, triggerPctFrac) >= 0;
                    
                    // if not, skip it.
                    if (!tradeIsTriggered) {
                        continue;
                    }

                    // But if it is triggered, add it to the list of positions to close
                    positionsToClose.push(position);
                }
            }
        }
        return positionsToClose;
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
                this.itemsByPeakPrice.setAtIndex(price, index, value);
                //this.itemsByPeakPrice.get(price)!![index] = value; // JS seems forgiving about out-of-order initialization by index
            }
        }
        // denseify the arrays (out-of-order initialization causes arrays to be sparse arrays behind the scene)
        for (const key of this.itemsByPeakPrice.keys()) {
            const sparseArray = this.itemsByPeakPrice.get(key)!!;
            this.itemsByPeakPrice.set(key, Array.from(sparseArray));
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
            this.itemsByPeakPrice.get(newPrice)!!.forEach((position, index) => {
                putEntries[this.makeStorageKey(newPrice,index)] = position;
            });
        }

        // for each price in common between here and last persistence, compare by array position
        const commonPrices = setIntersection(currentPriceSet, oldPriceSet, DecimalizedAmountSet);
        for (const commonPrice of commonPrices) {
            const oldArray = this._buffer.get(commonPrice)!!;
            const newArray = this.itemsByPeakPrice.get(commonPrice)!!;
            const iterUpperBound = Math.max(oldArray.length, newArray.length);
            for (let i = 0; i < iterUpperBound; i++) {
                if ((i in newArray) && (i in oldArray)) {
                    // common
                    const oldPosition = oldArray[i];
                    const newPosition = newArray[i];
                    if (!this.positionsEqualByValue(oldPosition,newPosition)) {
                        putEntries[this.makeStorageKey(commonPrice,i)] = newPosition;
                    }
                }
                else if (!(i in newArray)) {
                    // deleted
                    deletedKeys.add(this.makeStorageKey(commonPrice, i));
                }
                else if (!(i in oldArray)) {
                    // new
                    putEntries[this.makeStorageKey(commonPrice,i)] = newArray[i];
                }
            }
        }

        // for each price in the buffer, no longer in the items, mark it as deleted.
        const deletedPrices = setDifference(oldPriceSet, currentPriceSet, DecimalizedAmountSet);
        for (const deletedPrice of deletedPrices) {
            this._buffer.get(deletedPrice)!!.forEach((element, index) => {
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
            for (const position of this.itemsByPeakPrice.get(key)!!) {
                const clonedPositionObject = structuredClone(position);
                this._buffer.push(key, clonedPositionObject);
            }
        }
    }
    private positionsEqualByValue(a : Position, b : Position) : boolean {
        for (const key of Object.keys(a)) {
            if (!structuralEquals(a[key], b[key])) {
                return false;
            }
        }
        return true;
    }
}