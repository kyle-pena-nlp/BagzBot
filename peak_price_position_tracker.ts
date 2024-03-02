export class PeakPricePositionTracker<TPosition> {
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
    initialize(entries : Map<string,any>) {
        // TODO
        // parse
        // when done initializing, copy state to _buffer to avoid writing back fresh state to storage
    }
    flushToStorage(storage : DurableObjectStorage) {
        // TODO
        // perform a diff with buffer, use it to construct storage entries and delete entries
        // when done flushing, copy state to _buffer to avoid double-writing identical storage
    }
}