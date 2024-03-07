import { Position, PositionStatus, PositionType } from "../../common";
import { setDifference, setIntersection } from "../../util/set_operations";


export class PeakPricePositionTracker {

    /* positions grouped by peakPrice, and a buffer for diffing purposes since last flush to storage */
    _buffer : Map<number,Position[]> = new Map<number,Position[]>();
    itemsByPeakPrice : Map<number,Position[]> = new Map<number,Position[]>();
    pricePeakSessionKeyPrefix : string    
    
    // TODO: implement these: has, set, entries, get, keys

    // this will need to track value-level changes in TPosition as well as push, replace, etc., TPosition must implement equality
    // or.... maybe I could do a double-buffer on itemsByPeakPrice and diff-based solution?
    dirtyTracking : Map<number,boolean[]> = new Map<number,boolean[]>();
    deletedKeys : Set<number> = new Set<number>();

    constructor(pricePeakSessionKeyPrefix : string) {
        this.pricePeakSessionKeyPrefix = pricePeakSessionKeyPrefix;
    }
    push(price : number, position : Position) {
        if (!this.itemsByPeakPrice.has(price)) {
            this.itemsByPeakPrice.set(price, []);
        }
        this.itemsByPeakPrice.get(price)!!.push(position);
    }
    update(newPrice : number) {
        const peaks = [...this.itemsByPeakPrice.keys()];
        peaks.sort();
        const mergedPeaks = [];
        const mergedPositions = [];
        for (const peak of peaks) {
            if (peak < newPrice) {
                mergedPeaks.push(peak)
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
    }
    // TODO
    collectTrailingStopLossesToClose(newPrice : number) : Position[] {
        const positionsToClose = [];
        for (const peakPrice of this.itemsByPeakPrice.keys()) {
            // TODO: arbitrary precision arithmetic?
            const priceDecreaseFrac = (peakPrice - newPrice) / peakPrice;
            const positionsWithThisPeakPrice = this.itemsByPeakPrice.get(peakPrice)!!;
            for (const position of positionsWithThisPeakPrice) {
                // If it is not an open, long trailing stop loss, continue.
                const isOpenPosition = position.status === PositionStatus.Open; // this is super critical.
                if (!isOpenPosition) {
                    continue;
                }
                if (position.type === PositionType.LongTrailingStopLoss) {
                    // And the newPrice doesn't trigger the selloff of the position, continue.
                    const tradeIsTriggered = priceDecreaseFrac >= position.triggerPercent;
                    if (!tradeIsTriggered) {
                        continue;
                    }
                    // And add it to the list of positions to close
                    positionsToClose.push(position);
                }
            }
        }
        return positionsToClose;
    }
    /*ingestNewOpenPositions() {
    
    }*/
    initialize(entries : Map<string,any>) {
        // find storage itemsByPeakPrice prefixed with proper prefix, get price key, get array index, and set on this.itemsByPeakPrice at that index.
        const prefixRegex = this.prefixRegex();
        for (const [key,value] of entries) {
            if (prefixRegex.test(key)) {
                const [price,index] = this.parseStorageKey(key);
                if (!this.itemsByPeakPrice.has(price)) {
                    this.itemsByPeakPrice.set(price,[]);
                }
                this.itemsByPeakPrice.get(price)!![index] = value; // JS seems forgiving about out-of-order initialization by index
            }
        }
        // denseify the arrays (out-of-order initialization causes arrays to be sparse arrays behind the scene)
        for (const key of this.itemsByPeakPrice.keys()) {
            const sparseArray = this.itemsByPeakPrice.get(key)!!;
            this.itemsByPeakPrice.set(key, Array.from(sparseArray))
        }
        // when done initializing, copy state to _buffer to avoid writing back fresh state to storage
        this.copyItemsToBuffer();
    }
    async flushToStorage(storage : DurableObjectStorage) {
        const [putEntries,deletedKeys] = this.generateDiffFromItemsBuffer();        
        const putPromise = storage.put(putEntries);
        const deletePromise = storage.delete([...deletedKeys]);
        await Promise.all([putPromise,deletePromise]).then(() => {
            this.copyItemsToBuffer();
        })
    }
    private generateDiffFromItemsBuffer() : [Record<string,Position>,Set<string>] {
        const currentPriceSet = new Set<number>(this.itemsByPeakPrice.keys());
        const oldPriceSet = new Set<number>(this._buffer.keys());

        const putEntries : Record<string,Position> = {};
        const deletedKeys : Set<string> = new Set<string>();

        // add new entries for new price keys
        const newPrices = setDifference(currentPriceSet, oldPriceSet);
        for (const newPrice of newPrices) {
            this.itemsByPeakPrice.get(newPrice)!!.forEach((position, index) => {
                putEntries[this.makeStorageKey(newPrice,index)] = position;
            });
        }

        // for each price in common between here and last persistence, compare by array position
        const commonPrices = setIntersection(currentPriceSet, oldPriceSet);
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

        const deletedPrices = setDifference(oldPriceSet, currentPriceSet);
        for (const deletedPrice of deletedPrices) {
            this._buffer.forEach((element, index) => {
                const storageKey = this.makeStorageKey(deletedPrice, index);
                deletedKeys.add(storageKey);
            });
        }

        return [putEntries,deletedKeys];
    }
    private prefixRegex() : RegExp {
        return new RegExp(`^${this.pricePeakSessionKeyPrefix}:`);
    }
    private parseStorageKey(key : string) : [number,number] {
        const [prefix,priceString,indexString] = key.split(":");
        return [parseFloat(priceString), parseInt(indexString,10)];
    }
    private makeStorageKey(price : number, index : number) : string {
        // TODO: make decimalized prices the law of the land in this codebase
        return `${this.pricePeakSessionKeyPrefix}:${price.toString()}:${index.toString()}`
    }
    private copyItemsToBuffer() {
        this._buffer.clear();
        for (const key of this.itemsByPeakPrice.keys()) {
            this._buffer.set(key, []);
            for (const position of this.itemsByPeakPrice.get(key)!!) {
                const clonedPositionObject = structuredClone(position);
                this._buffer.get(key)!!.push(clonedPositionObject);
            }
        }
    }
    private positionsEqualByValue(a : Position, b : Position) : boolean {
        for (const key of Object.keys(a)) {
            if (a[key] !== b[key]) {
                return false;
            }
        }
        return true;
    }
}