import { setDifference, setIntersection } from "./set_operations";

type ValueType = string|number|boolean|null;

export class PeakPricePositionTracker<TPosition extends {[key:string]:ValueType}> {
    sessionKeyPrefix : string

    _buffer : Map<number,TPosition[]> = new Map<number,TPosition[]>();
    items : Map<number,TPosition[]> = new Map<number,TPosition[]>();
    
    // TODO: implement these: has, set, entries, get, keys

    // this will need to track value-level changes in TPosition as well as push, replace, etc., TPosition must implement equality
    // or.... maybe I could do a double-buffer on items and diff-based solution?
    dirtyTracking : Map<number,boolean[]> = new Map<number,boolean[]>();
    deletedKeys : Set<number> = new Set<number>();

    constructor(sessionKeyPrefix : string) {
        this.sessionKeyPrefix = sessionKeyPrefix;
    }
    push(price : number, position : TPosition) {
        if (!this.items.has(price)) {
            this.items.set(price, []);
        }
        this.items.get(price)!!.push(position);
    }
    update(newPrice : number) {
        const peaks = [...this.items.keys()];
        peaks.sort();
        const mergedPeaks = [];
        const mergedPositions = [];
        for (const peak of peaks) {
            if (peak < newPrice) {
                mergedPeaks.push(peak)
                mergedPositions.push(...this.items.get(peak)!!);
            }
            else {
                break;
            }
        }
        for (const mergedPeak of mergedPeaks) {
            this.items.delete(mergedPeak);
        }
        if (mergedPositions.length) {
            this.items.set(newPrice, mergedPositions);
        }
    }
    // TODO
    /*collectTrailingStopLossesToClose() : TPosition {

    }*/
    /*ingestNewOpenPositions() {
    
    }*/
    initialize(entries : Map<string,any>) {
        // find storage items prefixed with proper prefix, get price key, get array index, and set on this.items at that index.
        const prefixRegex = this.prefixRegex();
        for (const [key,value] of entries) {
            if (prefixRegex.test(key)) {
                const [price,index] = this.parseStorageKey(key);
                if (!this.items.has(price)) {
                    this.items.set(price,[]);
                }
                this.items.get(price)!![index] = value; // JS seems forgiving about out-of-order initialization by index
            }
        }
        // denseify the arrays (out-of-order initialization causes arrays to be sparse arrays behind the scene)
        for (const key of this.items.keys()) {
            const sparseArray = this.items.get(key)!!;
            this.items.set(key, Array.from(sparseArray))
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
    private generateDiffFromItemsBuffer() : [Record<string,TPosition>,Set<string>] {
        const currentPriceSet = new Set<number>(this.items.keys());
        const oldPriceSet = new Set<number>(this._buffer.keys());

        const putEntries : Record<string,TPosition> = {};
        const deletedKeys : Set<string> = new Set<string>();

        // add new entries for new price keys
        const newPrices = setDifference(currentPriceSet, oldPriceSet);
        for (const newPrice of newPrices) {
            this.items.get(newPrice)!!.forEach((position, index) => {
                putEntries[this.makeStorageKey(newPrice,index)] = position;
            });
        }

        // for each price in common between here and last persistence, compare by array position
        const commonPrices = setIntersection(currentPriceSet, oldPriceSet);
        for (const commonPrice of commonPrices) {
            const oldArray = this._buffer.get(commonPrice)!!;
            const newArray = this.items.get(commonPrice)!!;
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
        return new RegExp(`^${this.sessionKeyPrefix}:`);
    }
    private parseStorageKey(key : string) : [number,number] {
        const [prefix,priceString,indexString] = key.split(":");
        return [parseFloat(priceString), parseInt(indexString,10)];
    }
    private makeStorageKey(price : number, index : number) : string {
        // TODO: make decimalized prices the law of the land in this codebase
        return `${this.sessionKeyPrefix}:${price.toString()}:${index.toString()}`
    }
    private copyItemsToBuffer() {
        this._buffer.clear();
        for (const key of this.items.keys()) {
            this._buffer.set(key, []);
            for (const position of this.items.get(key)!!) {
                const clonedPositionObject = structuredClone(position);
                this._buffer.get(key)!!.push(clonedPositionObject);
            }
        }
    }
    private positionsEqualByValue(a : TPosition, b : TPosition) : boolean {
        for (const key of Object.keys(a)) {
            if (a[key] !== b[key]) {
                return false;
            }
        }
        return true;
    }
}