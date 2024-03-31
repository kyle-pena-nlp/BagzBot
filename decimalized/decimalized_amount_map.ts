import { DecimalizedAmount, fromKey, toKey } from "./decimalized_amount";

export class DecimalizedAmountMap<V> {
    inner : Map<string,V> = new Map<string,V>();
    constructor() {
    }
    get(decimalizedAmount : DecimalizedAmount) : V|undefined {
        const key = toKey(decimalizedAmount);
        return this.inner.get(key);
    }
    set(decimalizedAmount : DecimalizedAmount, value : V) {
        const key = toKey(decimalizedAmount);
        this.inner.set(key, value);
        return this;
    }
    clear() {
        this.inner.clear();
    }
    has(decimalizedAmount : DecimalizedAmount) : boolean {
        const key = toKey(decimalizedAmount);
        return this.inner.has(key);
    }
    delete(decimalizedAmount : DecimalizedAmount) : boolean {
        const key = toKey(decimalizedAmount);
        return this.inner.delete(key);
    }
    *keys() {
        for (const key of this.inner.keys()) {
            yield fromKey(key);
        }   
    }
    *values() {
        for (const value of this.inner.values()) {
            yield value;
        }
    }
    [Symbol.iterator](): Iterator<[DecimalizedAmount, V]> {
        const iterator = this.inner.entries();
        return {
            next(): IteratorResult<[DecimalizedAmount, V]> {
                let { value, done } = iterator.next();
                if (!done) {
                    // Modify the key before returning it
                    // Assuming the key is a string for this transformation; adjust as needed
                    value = [fromKey(value[0]), value[1]];
                }
                return { value, done };
            }
        };
    }   
    *entries() {
        for (const [key,value] of this.inner) {
            yield [fromKey(key),value];
        }
    }
    forEach(callback: (value: V, key: DecimalizedAmount, map: DecimalizedAmountMap<V>) => void): void {
        for (const [key, value] of this.inner) {
            callback(value, fromKey(key), this);
        }
    }
    get size() {
        return this.inner.size;
    }
    any() {
        return this.inner.size > 0;
    }
}