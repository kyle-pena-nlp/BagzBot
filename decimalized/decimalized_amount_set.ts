import { DecimalizedAmount, toKey, fromKey } from "./decimalized_amount";

export class DecimalizedAmountSet {
    inner : Set<string> = new Set<string>();
    constructor(items? : Iterable<DecimalizedAmount>) {
        if (items != null) {
            for (const item of items) {
                this.inner.add(toKey(item));
            }
        }
    }
    has(x : DecimalizedAmount) : boolean {
        const key = toKey(x);
        return this.inner.has(key);
    }
    add(x : DecimalizedAmount) : DecimalizedAmountSet {
        const key = toKey(x);
        this.inner.add(key);
        return this;
    }
    delete(x : DecimalizedAmount) : boolean {
        const key = toKey(x);
        return this.inner.delete(key)
    }
    clear() {
        this.inner.clear();
    }
    get size() : number {
        return this.inner.size;
    }
    forEach(callbackFn : (value: DecimalizedAmount, value2: DecimalizedAmount, set: DecimalizedAmountSet) => void, thisArg?: any) {
        this.inner.forEach((value, key) => {
          const parsedValue = fromKey(value);
          callbackFn.call(thisArg, parsedValue, parsedValue, this);
        });
    }    
    *[Symbol.iterator]() : IterableIterator<DecimalizedAmount> {
        for (const value of this.inner.values()) {
            yield fromKey(value);
        }
    }
    *entries() : IterableIterator<[DecimalizedAmount,DecimalizedAmount]> {
        for (const [value,value2] of this.inner.entries()) {
            const parsedValue = fromKey(value);
            yield [parsedValue,parsedValue];
        }
    }
    *values() : IterableIterator<DecimalizedAmount> {
        for (const value of this.inner.values()) {
            yield fromKey(value);
        }
    }

}