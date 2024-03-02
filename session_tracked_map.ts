export class SessionTrackedMap<TValue> {
    sessionKeyPrefix : string
    items : Map<string,TValue> = new Map<string,TValue>();
    dirtyTracking : Set<string> = new Set<string>();
    deletedKeys : Set<string> = new Set<string>();
    constructor(sessionKeyPrefix : string) {
        this.sessionKeyPrefix = sessionKeyPrefix;
    }
    get(key : string) : TValue|undefined {
        return this.items.get(this.addPrefix(key));
    }
    set(key : string, value : TValue) {
        this.items.set(this.addPrefix(key), value);
        this.dirtyTracking.add(key);
    }
    clear() {
        const allKeys = [...this.items.keys()];
        this.items.clear();
        for (const key of allKeys) {
            this.deletedKeys.add(key);
        }
    }
    has(key : string) {
        return this.items.has(this.addPrefix(key));
    }
    delete(key : string) {
        const existed = this.items.delete(this.addPrefix(key));
        if (existed) {
            this.deletedKeys.add(this.addPrefix(key));
        }
        return existed;
    }
    *keys() {
        const prefixRegex = this.prefixRegex();
        for (const key in this.items.keys()) {
            yield key.replace(prefixRegex, "");
        }   
    }
    *values() {
        for (const value of this.items.values()) {
            yield value;
        }
    }
    [Symbol.iterator](): Iterator<[string, TValue]> {
        const iterator = this.items.entries();
        const prefixRegex = this.prefixRegex();
        return {
            next(): IteratorResult<[string, TValue]> {
                let { value, done } = iterator.next();
                if (!done) {
                    // Modify the key before returning it
                    // Assuming the key is a string for this transformation; adjust as needed
                    value = [value[0].replace(prefixRegex, ""), value[1]];
                }
                return { value, done };
            }
        };
    }   
    *entries() {
        const prefixRegex = this.prefixRegex();
        for (const [key,value] of this.items) {
            yield [key.replace(prefixRegex,""),value];
        }
    }
    initialize(entries : Map<string,any>) {
        for (const [key,value] of entries) {
            if (this.prefixMatches(key)) {
                this.items.set(key, value);
            }
        }
    }
    async flushToStorage(storage : DurableObjectStorage) {
        const putEntries : Record<string,any> = {};
        for (const key of this.dirtyTracking) {
            putEntries[key] = this.items.get(key);
        }
        const putPromise = storage.put(putEntries).then(() => {
            this.dirtyTracking.clear();
        })
        const deletePromise = storage.delete([...this.deletedKeys]).then(() => {
            this.deletedKeys.clear();
        })
        await Promise.all([putPromise, deletePromise]);
    }
    private addPrefix(key : string) {
        return `${this.sessionKeyPrefix}:${key}`
    }
    private prefixMatches(key : string) {
        return this.prefixRegex().test(key);
    }
    private prefixRegex() {
        return new RegExp(`^${this.sessionKeyPrefix}:`);
    }
}